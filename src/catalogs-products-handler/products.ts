import { getHeaders } from "../headers-helper";

const AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION });

const ddbClient = new AWS.DynamoDB.DocumentClient();

const Sentry = require("@sentry/serverless");

Sentry.AWSLambda.init({
  dsn: process.env.DSN_URL,
  tracesSampleRate: 1.0,
});

export async function handler(event: any, context: any, callback: any) {
  let body;
  let statusCode = 200;
  const headers = getHeaders(event);

  let path = event.resource;
  let httpMethod = event.httpMethod;
  let route = httpMethod.concat(" ").concat(path);

  try {
    switch (route) {
      case "PUT /catalogs/products":
        const productData = JSON.parse(event.body);
        const putParams = {
          TableName: process.env.PRODUCTS_TABLE,
          Item: {
            user_sub: "products",
            identifier: productData.identifier,
            created_at: new Date().toISOString(),
            deleted_at: "-",
            isDelete: false,
          },
        };
        console.log({ message: "Inserting..." });
        await ddbClient.put(putParams).promise();
        console.log({ message: "Inserted Successfully" });
        body = "Records Inserted Successfully...";
        break;
      case "GET /catalogs/products":
        console.log({
          message: "Retrieving products record from dynamodb table",
        });
        const readProductsParams = {
          TableName: process.env.PRODUCTS_TABLE,
          KeyConditionExpression: "#user_sub = :user_sub",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
          },
          ExpressionAttributeValues: {
            ":user_sub": "products",
          },
        };
        body = await ddbClient.query(readProductsParams).promise();
        break;
      case "GET /catalogs/products/{identifier}":
        const readProductByIDParams = {
          TableName: process.env.PRODUCTS_TABLE,
          KeyConditionExpression:
            "#user_sub = :user_sub and #identifier = :identifier",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
            "#identifier": "identifier",
          },
          ExpressionAttributeValues: {
            ":user_sub": "products",
            ":identifier": event.pathParameters.identifier,
          },
        };
        body = await ddbClient.query(readProductByIDParams).promise();
        break;
      case "PUT /catalogs/products/{identifier}":
        const data = JSON.parse(event.body);

        const getProductParams = {
          TableName: process.env.PRODUCTS_TABLE,
          KeyConditionExpression:
            "#user_sub = :user_sub and #identifier = :identifier",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
            "#identifier": "identifier",
          },
          ExpressionAttributeValues: {
            ":user_sub": "products",
            ":identifier": event.pathParameters.identifier,
          },
        };
        const items = await ddbClient
          .query(getProductParams)
          .promise()
          .then((record: any) => {
            return record.Items;
          });
        items.forEach(async (item: any) => {
          Object.assign(item, data);
          await ddbClient
            .put({
              TableName: process.env.PRODUCTS_TABLE,
              Item: item,
            })
            .promise();
        });
        body = "Products updated successfully...";

        break;
      case "DELETE /catalogs/products/{identifier}":
        const updateDeleteparams = {
          TableName: process.env.PRODUCTS_TABLE,
          KeyConditionExpression:
            "#user_sub = :user_sub and #identifier = :identifier",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
            "#identifier": "identifier",
          },
          ExpressionAttributeValues: {
            ":user_sub": "products",
            ":identifier": event.pathParameters.identifier,
          },
        };
        const res = await ddbClient.query(updateDeleteparams).promise();
        if (res) {
          console.log("Data Found", res);
          res.Items.forEach(async (record: any) => {
            console.log("Record: ", record);
            if (!record.isDelete) {
              console.log(record.isDelete);
              record.deleted_at = new Date().toISOString();
              record.isDelete = true;
              console.log("Updated Record: ", record);
              const updateDeleteParam = {
                TableName: process.env.PRODUCTS_TABLE,
                Item: record,
              };
              await ddbClient.put(updateDeleteParam).promise();
            }
          });
        }
        body = "Records Updated Successfully...";
        break;
      default:
        throw new Error(`Unsupported route: "${route}"`);
    }
  } catch (err: any) {
    Sentry.captureException({ error: JSON.stringify(err) });
    console.log({ error: JSON.stringify(err) });
    statusCode = 400;
    body = err.message;
  } finally {
    console.log({ data: body });
    body = JSON.stringify(body);
  }

  return {
    statusCode,
    body,
    headers,
  };
}
