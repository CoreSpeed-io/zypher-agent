import fs from "fs"
import path from "path"
import { GitignoreParser, type Checker } from "./domain/parse_gitignore"
import { getWorkspaceDataDir } from "./utils"
import { json } from "stream/consumers"

const IGNORE_FILES = [
  ".gitignore",
  ".zypherignore"
]

class FileIgnorejudicator {
  workspace_path: string
  private checker_list: Checker[] = []
  constructor(workspace_path: string) {
    this.workspace_path = workspace_path
    IGNORE_FILES.flatMap((file_name) => {
      const filepath = path.join(workspace_path, file_name)
      return fs.existsSync(filepath) ? [
        GitignoreParser.compile(fs.readFileSync(filepath).toString())
      ] : []
    })
  }

  should_ignore_file(file_path: string) {
    for (const c of this.checker_list) {
      if (!c.accepts(file_path)) return false
    }
    return true
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
     *  1. If conducting forced search while indexing is running, this value can assist in determining whether the search results come from the latest file content.
     *  2  skip up-to-dated file when restoring from exsiting project.
     * */
    indexed_version: number
  }>
}


export class WorkspaceIndexingManager {
  workspace_path: string
  file_ignore: FileIgnorejudicator
  status_file_path: string
  status: WorkspaceIndexStatus = {
    project_id: '',
    status: 'stopped',
    files: {}
  }
  indexing_client: IndexingClient

  constructor(workspace_path: string, indexing_client: IndexingClient) {
    this.workspace_path = workspace_path
    this.file_ignore = new FileIgnorejudicator(workspace_path)
    this.status_file_path = path.join(this.workspace_path, "indexing_status.json")
    this.indexing_client = indexing_client
    if (!fs.existsSync(this.status_file_path)) {
      fs.writeFileSync(this.status_file_path, JSON.stringify(this.status))
    } else {
      this.status = JSON.parse(fs.readFileSync(this.status_file_path).toString())
    }
  }

  save_status() {
    fs.writeFileSync(this.status_file_path, JSON.stringify(this.status))
  }

  async init_indexing() {
    if (this.status.project_id === '') {
      this.status.project_id = await this.indexing_client.create_project()
      this.save_status()
    }
  }

  async embed_file(file_path: string) {
    const stat = fs.statSync(file_path)
    this.update_file_indexing_status({
      path: file_path,
      status: "running"
    })
    const version = stat.mtimeMs
    const result = await this.indexing_client.create_file_embedding(file_path, this.status.project_id)
    if (result.code === 0) {
      this.update_file_indexing_status({
        path: file_path,
        status: "done",
        
      })
    }
  }

  update_file_indexing_status(new_status: {path: string, status?: Status, indexed_version?: number}) {
    const old = this.status.files[new_status.path]
    this.status.files[new_status.path] = {
      ...old,
      ...new_status
    }
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

class IndexingClient {
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