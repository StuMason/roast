import { Construct } from 'constructs';
import { 
  Stack, StackProps, CfnOutput, Duration, RemovalPolicy,
  aws_secretsmanager as secretsmanager,
  aws_rds as rds,
  aws_iam as iam,
  aws_ec2 as ec2,
 } from 'aws-cdk-lib';
import { ServerlessLaravel } from 'cdk-serverless-lamp';
import * as path from 'path';

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc',{ maxAzs: 3, natGateways: 1 } )

    const masterUser = 'admin';
    // generate and store password for masterUser in the secrets manager
    const masterUserSecret = new secretsmanager.Secret(this, 'DbMasterSecret', {
      secretName: `${Stack.of(this).stackName}-DbMasterSecret`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: masterUser,
        }),
        passwordLength: 12,
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password',
      },
    });

    const dbConnectionGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc: vpc,
    });
    dbConnectionGroup.connections.allowInternally(ec2.Port.tcp(3306));

    const auroraServerless = new rds.ServerlessCluster(this, 'AuroraServerless', {
      engine: rds.DatabaseClusterEngine.AURORA_MYSQL,
      credentials: rds.Credentials.fromSecret(masterUserSecret),
      vpc: vpc,
      securityGroups: [dbConnectionGroup],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const brefLayerVersion = 'arn:aws:lambda:eu-west-1:209497400698:layer:php-81-fpm:19';

    new ServerlessLaravel(this, 'ServerlessLaravel', {
      brefLayerVersion: brefLayerVersion,
      laravelPath: path.join(__dirname, '../../codebase'),
      databaseConfig: {
        writerEndpoint: auroraServerless.clusterEndpoint.hostname,
        masterUserName: masterUser,
        masterUserPasswordSecret: masterUserSecret,
      },
    });

  }
}