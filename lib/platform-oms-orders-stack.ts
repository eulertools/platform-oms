import { Duration, Fn, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { LambdaIntegration, LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Effect } from "aws-cdk-lib/aws-iam";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class PlatformOMSOrdersApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone } = props!;

    const ordersTable = new dynamodb.Table(this, "orders-table", {
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "order_id",
        type: dynamodb.AttributeType.STRING,
      },
      tableName: "orders",
      billingMode: dynamodb.BillingMode.PROVISIONED,
    });

    const certificateArn = Fn.importValue("certificate-public-api");

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(
      this,
      "sentryDSN",
      "sentryDSN"
    );

    const certificate = Certificate.fromCertificateArn(
      this,
      "Certificate",
      certificateArn
    );

    const apiDynamodbOrders = new NodejsFunction(
      this,
      "orders-dynamodb-api-handler",
      {
        functionName: "orders-dynamodb-api-handler",
        handler: "handler",
        description: "Create orders api that retrieves records from dynamodb",
        entry: path.join(
          __dirname,
          `/../src/catalogs-orders-handler/orders.ts`
        ),
        runtime: lambda.Runtime.NODEJS_14_X,
        timeout: Duration.minutes(1),
        environment: {
          ORDERS_TABLE: ordersTable.tableName,
          DSN_URL: sentryDSN.secretValue.toString(),
        },
      }
    );

    ordersTable.grantReadWriteData(apiDynamodbOrders);

    apiDynamodbOrders.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    const publicZone = route53.HostedZone.fromLookup(
      this,
      "public-hosted-zone",
      {
        privateZone: false,
        domainName: hostedZone,
      }
    );

    const apiResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["execute-api:Invoke"],
          principals: [new iam.AnyPrincipal()],
          resources: ["execute-api:/*"],
        }),
      ],
    });

    const restApi = new LambdaRestApi(this, `app-orders-api`, {
      handler: apiDynamodbOrders,
      description:
        "Platform Directory API includes orders related to the catalogs",
      deployOptions: {
        stageName: process.env.ENV,
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: [
          `https://workflows.${hostedZone}`,
          "http://localhost:8080",
        ],
      },
      restApiName: "orders-api",
      proxy: false,
      policy: apiResourcePolicy,
    });

    restApi.addDomainName("orders-api", {
      domainName: `orders.api.${hostedZone}`,
      certificate: certificate,
    });

    new route53.ARecord(this, "custom-domain-alias-record-orders", {
      recordName: "orders.api",
      zone: publicZone,
      target: route53.RecordTarget.fromAlias(
        new route53targets.ApiGateway(restApi)
      ),
    });

    const users = restApi.root.addResource("catalogs");
    const allSubscription = users.addResource("orders");
    const oneSubscription = allSubscription.addResource("{user_id}");

    allSubscription.addMethod("PUT", new LambdaIntegration(apiDynamodbOrders));

    allSubscription.addMethod("GET", new LambdaIntegration(apiDynamodbOrders));

    oneSubscription.addMethod("GET", new LambdaIntegration(apiDynamodbOrders));

    oneSubscription.addMethod(
      "DELETE",
      new LambdaIntegration(apiDynamodbOrders)
    );

    oneSubscription.addMethod("PUT", new LambdaIntegration(apiDynamodbOrders));
  }
}
