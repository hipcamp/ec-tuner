import {SimpleInstance} from './models/simple-instance';
import {EC2Service} from './services/ec2.service';

const ec2 = new EC2Service('us-east-1');

ec2
  .startInstanceByLabel('hulkbuster')
  .then((instance: SimpleInstance | undefined) => {
    setTimeout(() => {
      if (instance) {
        console.log('Stopping instance...');
        ec2.stopInstance(instance.id);
      }
    }, 60000);
  });
