import {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {GithubRunner} from '../models/github-runner'

const STOPPING_LABEL = 'stopping'
const WORKFLOW_LABEL_REGEX = /^\d+-.*$/g

export class GithubService {
  private readonly _client: Octokit
  private readonly organization: string

  constructor(token: string) {
    this._client = new Octokit({
      auth: `token ${token}`
    })
    this.organization = (process.env['GITHUB_REPOSITORY'] as string).split(
      '/'
    )[0]
    core.debug(`set organization to: ${this.organization}`)
  }

  async getStartableRunnersWithLabel(label: string): Promise<GithubRunner[]> {
    // favor runners with the least amount of workflows assigned, starting with runners that are off
    const startableRunners = (await this.getRunnersWithLabels([label])).filter(
      x => !this.runnerHasStoppingLabel(x)
    )

    return startableRunners.sort((a: GithubRunner, b: GithubRunner) => {
      if (a.status === b.status) {
        return this.runnerWorkflowLabels(a).length <
          this.runnerWorkflowLabels(b).length
          ? -1
          : 1
      } else {
        return a.status === 'offline' ? -1 : 1
      }
    })
  }

  async getStoppableRunners(): Promise<GithubRunner[]> {
    return (await this.getRunnersWithLabels([STOPPING_LABEL])).filter(x =>
      this.runnerCanBeStopped(x)
    )
  }

  runnerCanBeStopped(runner: GithubRunner): boolean {
    return (
      this.runnerHasStoppingLabel(runner) &&
      !this.runnerHasWorkflowLabel(runner)
    )
  }

  runnerHasStoppingLabel(runner: GithubRunner): boolean {
    for (const label of runner.labels) {
      if (label.name === STOPPING_LABEL) {
        return true
      }
    }
    return false
  }

  runnerHasWorkflowLabel(runner: GithubRunner): boolean {
    return this.runnerWorkflowLabels(runner).length > 0
  }

  runnerWorkflowLabels(runner: GithubRunner): string[] {
    const workflowLabels = []

    for (const label of runner.labels) {
      if (label.name.match(WORKFLOW_LABEL_REGEX)) {
        workflowLabels.push(label.name)
      }
    }

    return workflowLabels
  }

  async getRunnersWithLabels(labels: string[]): Promise<GithubRunner[]> {
    const response = await this._client.paginate(
      'GET /orgs/{org}/actions/runners',
      {
        org: 'hipcamp'
      }
    )
    return response
      .filter(x => {
        const labelSet: Set<string> = new Set(labels)
        for (const githubLabel of x.labels) {
          if (githubLabel.name && labelSet.has(githubLabel.name)) {
            labelSet.delete(githubLabel.name)
          }
        }
        return labelSet.size === 0
      })
      .map(x => {
        return {
          id: x.id,
          name: x.name,
          busy: x.busy,
          status: x.status,
          labels: x.labels,
          ip: x.name
            .replace(/^ip-/i, '')
            .replace(/-\d+$/i, '')
            .replace(/-/g, '.')
        }
      }) as GithubRunner[]
  }

  async getRunnersWithoutLabel(label: string): Promise<GithubRunner[]> {
    const response = await this._client.paginate(
      'GET /orgs/{org}/actions/runners',
      {
        org: 'hipcamp'
      }
    )
    return response
      .filter(x => {
        for (const githubLabel of x.labels) {
          if (label === githubLabel.name) {
            return false
          }
        }
        return true
      })
      .map(x => {
        return {
          id: x.id,
          name: x.name,
          busy: x.busy,
          status: x.status,
          labels: x.labels,
          ip: x.name
            .replace(/^ip-/i, '')
            .replace(/-\d+$/i, '')
            .replace(/-/g, '.')
        }
      }) as GithubRunner[]
  }

  async markRunnerAsStopping(runnerId: number): Promise<void> {
    return this.addCustomLabelToRunner(runnerId, STOPPING_LABEL)
  }

  async markRunnerAsStoppedSuccessfully(runnerId: number): Promise<void> {
    return this.removeCustomLabelFromRunner(runnerId, STOPPING_LABEL)
  }

  async addCustomLabelToRunner(runnerId: number, label: string): Promise<void> {
    await this._client.request(
      'POST /orgs/{org}/actions/runners/{runner_id}/labels',
      {
        org: 'hipcamp',
        runner_id: runnerId,
        labels: [label]
      }
    )
  }

  async removeCustomLabelFromRunner(
    runnerId: number,
    label: string
  ): Promise<void> {
    await this._client.request(
      'DELETE /orgs/{org}/actions/runners/{runner_id}/labels/{name}',
      {
        org: 'hipcamp',
        runner_id: runnerId,
        name: label
      }
    )
  }
}
