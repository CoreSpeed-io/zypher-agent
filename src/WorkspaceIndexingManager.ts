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

type Status = 'running' | 'stopped'

type WorkspaceIndexStatus = {
  status: Status,
  files: Record<string, {
    path: string,
    status: Status,
    last_modified: number
  }>
}


export class WorkspaceIndexingManager {
  workspace_path: string
  file_ignore: FileIgnorejudicator
  status_file_path: string
  status: WorkspaceIndexStatus = {
    status: 'stopped',
    files: {}
  }

  constructor(workspace_path: string) {
    this.workspace_path = workspace_path
    this.file_ignore = new FileIgnorejudicator(workspace_path)
    this.status_file_path = path.join(this.workspace_path, "indexing_status.json")
    if (!fs.existsSync(this.status_file_path)) {
      fs.writeFileSync(this.status_file_path, JSON.stringify(this.status))
    } else {
      this.status = JSON.parse(fs.readFileSync(this.status_file_path).toString())
    }
  }

  init_workspace() {
    getWorkspaceDataDir()
  }

  update_file_indexing_status(path: string, status: Status, last_modified: number) {
    this.status.files[path] = {
      path,
      status,
      last_modified
    }
    fs.writeFileSync(this.status_file_path, JSON.stringify(this.status))
  }

  update_overall_runing_status(status: Status) {
    this.status.status = status
    fs.writeFileSync(this.status_file_path, JSON.stringify(this.status))
  }
}