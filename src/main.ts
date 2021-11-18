import * as core from '@actions/core'
import {SimpleInstance} from './models/simple-instance'
import {EC2Service} from './services/ec2.service'

async function run(
  entryTime: Date = new Date(),
  modifiedIds: string[] = []
): Promise<void> {
  const region: string = core.getInput('region')
  const label: string = core.getInput('label')
  const token: string = core.getInput('token')
  const timeout: number = +core.getInput('timeout') || 60
  const action: string = core.getInput('action')
  const runners: number = +core.getInput('runners')
  const block: number = +core.getInput('block')

  try {
    const ec2: EC2Service = new EC2Service(region, token)

    if (action.toLowerCase() === 'start') {
      if (label) {
        while (modifiedIds.length < runners) {
          const elapsedTime = Date.now() - entryTime.getTime()
          if (elapsedTime / 1000 >= timeout) {
            throw new Error('start timeout has exceeded')
          }

          core.info(
            `Have started ${
              modifiedIds.length
            } of ${runners} instances after ${Math.round(
              elapsedTime / 1000
            )} seconds..`
          )

          const neededRunners: number = runners - modifiedIds.length

          const instancesStarted = await ec2.startInstances(
            label,
            block <= neededRunners ? block : neededRunners,
            modifiedIds
          )

          modifiedIds.push(...instancesStarted)
        }

        core.setOutput('started', modifiedIds.length)
        core.setOutput('label', label)
      } else {
        throw new Error('label is required')
      }
    } else if (action.toLowerCase() === 'stop') {
      while (modifiedIds.length < runners) {
        const elapsedTime = Date.now() - entryTime.getTime()
        if (elapsedTime / 1000 >= timeout) {
          throw new Error('stop timeout has exceeded')
        }

        core.info(
          `Have stopped ${
            modifiedIds.length
          } of ${runners} instances after ${Math.round(
            elapsedTime / 1000
          )} seconds..`
        )

        const idleInstances: SimpleInstance[] = await ec2.getIdleInstances(
          label,
          runners - modifiedIds.length
        )
        const instanceIds = idleInstances.map(instance => instance.id)
        const instancePrivateIps = idleInstances.map(
          instance => instance.privateIp
        )

        if (instanceIds.length > 0) {
          core.info(
            `GitHub Idle Runners to Stop: ${JSON.stringify(instanceIds)}`
          )

          await ec2.stopInstances(instanceIds)

          // Make sure the runners are actually idle in GH before adding to count
          // eslint-disable-next-line no-empty
          while (await ec2.anyStoppedInstanceRunning(instancePrivateIps)) {}
          modifiedIds.push(...instanceIds)
        }
      }

      core.info(
        `Successfully shut down ${modifiedIds.length} of ${runners} instances!`
      )
    } else if (action.toLowerCase() === 'test') {
      core.info('Able to trigger action run!')
    } else {
      throw new Error(`(${action}) is not a valid action`)
    }
  } catch (error) {
    if ((new Date().getTime() - entryTime.getTime()) / 1000 >= timeout) {
      if (action.toLowerCase() === 'start' || action.toLowerCase() === 'stop') {
        if (modifiedIds.length === 0) {
          core.warning(
            `Heads up! Was not able to ${action.toLowerCase()} any of the ${runners} required runners..`
          )
        } else {
          core.warning(
            `Heads up! Only was able to ${action.toLowerCase()} ${
              modifiedIds.length
            } of ${runners} runners..`
          )
        }
      } else {
        core.setFailed(error.message)
      }
    } else {
      core.info(`${error.message}. Attempting again in 5 seconds...`)
      setTimeout(() => {
        run(entryTime, modifiedIds)
      }, 5000)
    }
  }
}

run()
