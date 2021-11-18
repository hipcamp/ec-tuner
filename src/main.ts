import * as core from '@actions/core'
import {SimpleInstance} from './models/simple-instance'
import {EC2Service} from './services/ec2.service'

async function run(
  entryTime: Date = new Date(),
  stoppedInstanceCount = 0
): Promise<void> {
  const region: string = core.getInput('region')
  const label: string = core.getInput('label')
  const token: string = core.getInput('token')
  const timeout: number = +core.getInput('timeout') || 60
  const action: string = core.getInput('action')
  const runners: number = +core.getInput('runners')

  try {
    const ec2: EC2Service = new EC2Service(region, token)

    if (action.toLowerCase() === 'start') {
      if (label) {
        try {
          const instances: SimpleInstance[] = await ec2.getFreeInstances(
            label,
            runners
          )
          await ec2.startInstances(instances.map(x => x.id))
          if (instances.length < runners) {
            core.warning(
              `Could only start ${instances.length} of the requested ${runners} instance(s)`
            )
          }
          core.setOutput('ids', instances.map(x => x.id).join(' '))
          core.setOutput('started', instances.length)
          core.setOutput('label', label)
        } catch (e) {
          throw e
        }
      } else {
        throw new Error('label is required')
      }
    } else if (action.toLowerCase() === 'stop') {
      while (stoppedInstanceCount < runners) {
        const elapsedTime = Date.now() - entryTime.getTime()
        if (elapsedTime / 1000 >= timeout) {
          throw new Error('stop timeout has exceeded')
        }

        core.info(
          `Have stopped ${stoppedInstanceCount} of ${runners} instances after ${Math.round(
            elapsedTime / 1000
          )} seconds..`
        )

        const idleInstances: SimpleInstance[] = await ec2.getIdleInstances(
          label,
          runners - stoppedInstanceCount
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
          stoppedInstanceCount += instanceIds.length
        }
      }

      core.info(
        `Successfully shut down ${stoppedInstanceCount} of ${runners} instances!`
      )
    } else if (action.toLowerCase() === 'test') {
      core.info('Able to trigger action run!')
    } else {
      throw new Error(`(${action}) is not a valid action`)
    }
  } catch (error) {
    if ((new Date().getTime() - entryTime.getTime()) / 1000 >= timeout) {
      if (action.toLowerCase() === 'stop') {
        if (stoppedInstanceCount === 0) {
          core.warning(
            `Heads up! Was not able to shut down any of the ${runners} required runners..`
          )
        } else {
          core.warning(
            `Heads up! Only shut down ${stoppedInstanceCount} of ${runners} runners..`
          )
        }
      } else {
        core.setFailed(error.message)
      }
    } else {
      core.info(`Error ${error.message}. Attempting again in 5 seconds...`)
      setTimeout(() => {
        run(entryTime, stoppedInstanceCount)
      }, 5000)
    }
  }
}

run()
