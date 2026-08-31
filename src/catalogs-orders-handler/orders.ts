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
      case "PUT /catalogs/orders":
        const productData = JSON.parse(event.body);
        const putParams = {
          TableName: process.env.ORDERS_TABLE,
          Item: {
            user_id: productData.user_id,
            order_id: productData.order_id,
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
      case "GET /catalogs/orders":
        console.log({
          message: "Retrieving orders record from dynamodb table",
        });
        body = await ddbClient
          .scan({ TableName: process.env.ORDERS_TABLE })
          .promise();
        break;
      case "GET /catalogs/orders/{user_id}":
        const getQueryParam = event.queryStringParameters;

        if (getQueryParam) {
          const readProductByOrderIdParams = {
            TableName: process.env.ORDERS_TABLE,
            KeyConditionExpression:
              "#user_id = :user_id and #order_id = :order_id",
            ExpressionAttributeNames: {
              "#user_id": "user_id",
              "#order_id": "order_id",
            },
            ExpressionAttributeValues: {
              ":user_id": event.pathParameters.user_id,
              ":order_id": getQueryParam.order_id,
            },
          };
          body = await ddbClient.query(readProductByOrderIdParams).promise();
        } else {
          const readProductByIDParams = {
            TableName: process.env.ORDERS_TABLE,
            KeyConditionExpression: "#user_id = :user_id",
            ExpressionAttributeNames: {
              "#user_id": "user_id",
            },
            ExpressionAttributeValues: {
              ":user_id": event.pathParameters.user_id,
            },
          };
          body = await ddbClient.query(readProductByIDParams).promise();
        }

        break;
      case "PUT /catalogs/orders/{user_id}":
        const data = JSON.parse(event.body);
        const putQueryParam = event.queryStringParameters;

        const getProductParams = {
          TableName: process.env.ORDERS_TABLE,
          KeyConditionExpression:
            "#order_id = :order_id and #user_id = :user_id",
          ExpressionAttributeNames: {
            "#order_id": "order_id",
            "#user_id": "user_id",
          },
          ExpressionAttributeValues: {
            ":order_id": putQueryParam.order_id,
            ":user_id": event.pathParameters.user_id,
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
              TableName: process.env.ORDERS_TABLE,
              Item: item,
            })
            .promise();
        });
        body = "orders updated successfully...";

        break;
      case "DELETE /catalogs/orders/{user_id}":
        const deletQueryParam = event.queryStringParameters;

        const updateDeleteparams = {
          TableName: process.env.ORDERS_TABLE,
          KeyConditionExpression:
            "#order_id = :order_id and #user_id = :user_id",
          ExpressionAttributeNames: {
            "#order_id": "order_id",
            "#user_id": "user_id",
          },
          ExpressionAttributeValues: {
            ":order_id": deletQueryParam.order_id,
            ":user_id": event.pathParameters.user_id,
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
                TableName: process.env.ORDERS_TABLE,
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
