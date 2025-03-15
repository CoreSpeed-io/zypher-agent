import fs from "fs"
import path from "path"
import { GitignoreParser, type Checker } from "./domain/parse_gitignore"
import { getWorkspaceDataDir } from "./utils"

const IGNORE_FILES = [
  ".gitignore",
  ".zypherignore"
]

class FileIgnorejudicator {
  workspace_path: string
  private checker_list: Checker[] = []
  constructor(workspace_path: string) {
    this.workspace_path = workspace_path
    this.checker_list = IGNORE_FILES.flatMap((file_name) => {
      const filepath = path.join(workspace_path, file_name)
      return fs.existsSync(filepath) ? [
        GitignoreParser.compile(fs.readFileSync(filepath).toString())
      ] : []
    })
  }

  should_ignore_file(file_path: string) {
    if(path.parse(file_path).base == '.git') return true
    for (const c of this.checker_list) {
      if (!c.accepts(file_path)) return true
    }
    return false
  }
}

type Status = 'running' | 'done' | 'stopped'

type WorkspaceIndexStatus = {
  project_id: string, // identifier of this project in indexing service
  status: Status,
  files: Record<string, {
    path: string,
    status: Status,
    /**
     * 1. If conducting forced search while indexing is running, this value can assist in determining whether the search results come from the latest file content.
     * 2. Skip up-to-dated file when restoring from exsiting project.
     * */
    indexed_version: number
  }>
}

function* DirectoryIterator(dirPath: string, should_ignore_file: (path: string) => boolean) {
  const queue = [dirPath]
  while (queue.length > 0) {
    const currentLevel = [...queue]
    queue.length = 0
    for (const dir of currentLevel) {
      try {
        const items = fs.readdirSync(dir)
        const stats = items.map(item => fs.statSync(path.join(dir, item)))
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const fullPath = path.join(dir, item)
          if (should_ignore_file(fullPath)) {
            continue
          }
          if (stats[i].isDirectory()) {
            queue.push(fullPath);
          } else {
            yield fullPath
          }
        }
      } catch (err) {
        console.error(`Error reading directory ${dir}:`, err);
      }
    }
  }
}

export class WorkspaceIndexingManager {
  workspace_path: string
  file_ignore: FileIgnorejudicator
  status_file_path: string = ""
  status: WorkspaceIndexStatus = {
    project_id: '',
    status: 'stopped',
    files: {}
  }
  indexing_client: IndexingClient

  private constructor(workspace_path: string, indexing_client: IndexingClient, status_file_path: string) {
    this.workspace_path = workspace_path
    this.file_ignore = new FileIgnorejudicator(workspace_path)
    this.indexing_client = indexing_client
    this.status_file_path = status_file_path
    if (!fs.existsSync(status_file_path)) {
      fs.writeFileSync(status_file_path, JSON.stringify(this.status), { flag: 'w' })
    } else {
      this.status = JSON.parse(fs.readFileSync(status_file_path).toString())
    }
  }

  static async create(workspace_path: string, indexing_client: IndexingClient) {
    const status_file_path = path.join(await getWorkspaceDataDir(), "indexing_status.json")
    console.log("status_file_path", status_file_path)
    return new WorkspaceIndexingManager(workspace_path, indexing_client, status_file_path)
  }

  async init(onFinsh: () => void) {
    await this._traverse_indexing()
    // TODO: start file watching here
    onFinsh()
  }

  private save_status() {
    fs.writeFileSync(this.status_file_path, JSON.stringify(this.status), { flag: 'w' })
  }

  async _traverse_indexing() {
    if (this.status.project_id === '') {
      this.status.project_id = await this.indexing_client.create_project()
      this.save_status()
    }
    const dir_iter = DirectoryIterator(this.workspace_path, (path: string) => this.file_ignore.should_ignore_file(path))
    while (true) {
      const file_path = dir_iter.next()
      if (file_path.value) await this.embed_file(file_path.value)
      // multiprocessing here
      if (file_path.done) break
    }
  }

  async embed_file(file_path: string) {
    const stat = fs.statSync(file_path)
    const version = stat.mtimeMs
    console.log(`${file_path}, version ${version}, indexed version ${(this.status.files[file_path])?.indexed_version}`)

    if (file_path in this.status.files && this.status.files[file_path].indexed_version === version) {
      console.log(`indexed file ${file_path}, skipped`)
      return
    }

    this.update_file_indexing_status({
      path: file_path,
      status: "running"
    })
    const result = await this.indexing_client.create_file_embedding(file_path, this.status.project_id)
    if (result.code === 0) {
      this.update_file_indexing_status({
        path: file_path,
        status: "done",
        indexed_version: version
      })
    }
  }

  update_file_indexing_status(new_status: { path: string, status?: Status, indexed_version?: number }) {
    const old = this.status.files[new_status.path]
    this.status.files[new_status.path] = {
      ...old,
      ...new_status
    }
    this.save_status()
  }

  update_overall_runing_status(status: Status) {
    this.status.status = status
    this.save_status()
  }
}

interface Response<T> {
  msg: string
  data: T,
  code: number
}

interface ProjectCreateReponse {
  id: string
}

export class IndexingClient {
  private indexing_service_endpoint: string
  constructor(indexing_service_endpoint: string) {
    this.indexing_service_endpoint = indexing_service_endpoint
  }

  async create_project(): Promise<string> {
    const url = `${this.indexing_service_endpoint}/v1/project/create`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'ZypherAgent',
        'Content-Type': 'application/json',
      }
    });
    const data: Response<ProjectCreateReponse> = await response.json();
    return data.data.id
  }

  async create_file_embedding(file_path: string, project_id: string): Promise<Response<any>> {
    const url = `${this.indexing_service_endpoint}/v1/embed/file`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'ZypherAgent',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "project_id": project_id,
        "file_path": file_path,
        "file_content": fs.readFileSync(file_path).toString(),
        "coding_language": ""
      })
    });
    const data: Response<any> = await response.json()
    return data
  }
}
