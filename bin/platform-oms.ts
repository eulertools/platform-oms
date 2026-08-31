#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { PlatformOMSProductsApiStack } from "../lib/platform-oms-products-stack";
import { PlatformOMSOrdersApiStack } from "../lib/platform-oms-orders-stack";

const app = new App();

const hostedZone =
  process.env.CDK_DEFAULT_ACCOUNT === process.env.CDK_DEV_ACCOUNT
    ? "dev.euler.tools"
    : "prod.euler.tools";

new PlatformOMSProductsApiStack(app, "platform-osm-products-api-stack", {
  hostedZone,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new PlatformOMSOrdersApiStack(app, "platform-osm-orders-api-stack", {
  hostedZone,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
