import {GithubRunner} from '../models/github-runner'
import {SimpleInstance} from '../models/simple-instance'
import {EC2Service} from './ec2.service'
import {GithubService} from './github.service'
import * as core from '@actions/core'

export class ControllerService {
  private readonly _ec2Service: EC2Service
  private readonly _githubService: GithubService
  private readonly runId: string

  constructor(region: string, token: string) {
    this._ec2Service = new EC2Service(region)
    this._githubService = new GithubService(token)
    this.runId = process.env['GITHUB_RUN_ID'] as string
  }

  private getDynamicLabel(label: string): string {
    return `${this.runId}-${label}`
  }

  async startInstances(
    label: string,
    runners = 1,
    sanitizeIds: string[] = []
  ): Promise<SimpleInstance[]> {
    return new Promise(async resolve => {
      const matchingGithubRunners: GithubRunner[] = await this._githubService.getStartableRunnersWithLabel(
        label
      )

      const ec2InstanceMap: Map<
        string,
        SimpleInstance
      > = await this._ec2Service.getEC2InstancesByPrivateIps(
        matchingGithubRunners.map(x => x.ip)
      )

      const assignedInstances: SimpleInstance[] = []

      for (const runner of matchingGithubRunners) {
        if (assignedInstances.length === runners) {
          break
        }

        const ec2Instance = ec2InstanceMap.get(runner.ip)

        try {
          if (ec2Instance && !sanitizeIds.includes(ec2Instance.id)) {
            await this._ec2Service.startInstances([ec2Instance.id])
            await this._githubService.addCustomLabelToRunner(
              runner.id,
              this.getDynamicLabel(label)
            )
            assignedInstances.push(ec2Instance)
          }
        } catch (err) {
          core.info(`Could not start EC2 Instance: ${ec2Instance?.id}`)
        }
      }
      resolve(assignedInstances)
    })
  }

  async stopInstances(label: string): Promise<SimpleInstance[]> {
    return new Promise(async resolve => {
      const matchingRunners: GithubRunner[] = await this._githubService.getRunnersWithLabels(
        [this.getDynamicLabel(label)]
      )

      for (const runner of matchingRunners) {
        // await this._githubService.markRunnerAsStopping(runner.id)
        await this._githubService.removeCustomLabelFromRunner(
          runner.id,
          this.getDynamicLabel(label)
        )
      }

      const stoppableRunners: GithubRunner[] = await this._githubService.getStoppableRunners()

      const ec2InstanceMap: Map<
        string,
        SimpleInstance
      > = await this._ec2Service.getEC2InstancesByPrivateIps(
        stoppableRunners.map(x => x.ip)
      )

      const stoppedInstances: SimpleInstance[] = []

      for (const runner of stoppableRunners) {
        const ec2Instance: SimpleInstance = ec2InstanceMap.get(
          runner.ip
        ) as SimpleInstance
        try {
          await this._ec2Service.stopInstances([ec2Instance.id])
          await this._githubService.markRunnerAsStoppedSuccessfully(runner.id)
          stoppedInstances.push(ec2Instance)
        } catch (err) {
          core.info(`Could not stop instance (${ec2Instance.id})`)
        }
      }

      resolve(stoppedInstances)
    })
  }

  async cleanupInstances(): Promise<SimpleInstance[]> {
    return new Promise(async resolve => {
      // add cleanup for expired workflows
      await this._githubService.cleanupExpiredWorkflows()

      const stoppableRunners: GithubRunner[] = await this._githubService.getStoppableRunners()

      const ec2InstanceMap: Map<
        string,
        SimpleInstance
      > = await this._ec2Service.getEC2InstancesByPrivateIps(
        stoppableRunners.map(x => x.ip)
      )

      const stoppedInstances: SimpleInstance[] = []

      for (const runner of stoppableRunners) {
        const ec2Instance: SimpleInstance = ec2InstanceMap.get(
          runner.ip
        ) as SimpleInstance
        try {
          await this._ec2Service.stopInstances([ec2Instance.id])
          await this._githubService.markRunnerAsStoppedSuccessfully(runner.id)
          stoppedInstances.push(ec2Instance)
        } catch (err) {
          core.info(`Could not stop instance (${ec2Instance.id})`)
        }
      }

      resolve(stoppedInstances)
    })
  }
}
