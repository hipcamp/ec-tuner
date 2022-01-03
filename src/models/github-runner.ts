export interface GithubRunner {
  id: number
  name: string
  status: string
  busy: boolean
  labels: GithubRunnerLabel[]
  ip: string
}

export interface GithubRunnerLabel {
  id: number
  name: string
  type: string
}
