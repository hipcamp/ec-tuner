import * as core from '@actions/core'
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

  core.setOutput('requested', runners)

  // check for label
  if (!label) {
    core.error('(label) is a required parameter')
  }

  try {
    const ec2: EC2Service = new EC2Service(region, token)

    const formattedAction = action.toLowerCase()

    while (modifiedIds.length < runners) {
      const elapsedTime = Date.now() - entryTime.getTime()
      if (elapsedTime / 1000 >= timeout) {
        throw new Error('start timeout has exceeded')
      }

      core.info(
        `Have run action (${formattedAction}) on ${
          modifiedIds.length
        } of ${runners} instances after ${Math.round(
          elapsedTime / 1000
        )} seconds..`
      )

      const neededRunners: number = runners - modifiedIds.length

      if (formattedAction === 'start') {
        const instancesStarted = await ec2.startInstances(
          label,
          block <= neededRunners ? block : neededRunners,
          modifiedIds
        )

        modifiedIds.push(...instancesStarted)
      } else if (formattedAction === 'stop') {
        const instancesStarted = await ec2.stopInstances(
          label,
          block <= neededRunners ? block : neededRunners,
          modifiedIds
        )

        modifiedIds.push(...instancesStarted)
      }
    }

    core.setOutput('started', modifiedIds.length)
    core.setOutput('label', label)
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
        core.setOutput('started', modifiedIds.length)
        core.setOutput('label', label)
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
