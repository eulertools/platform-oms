export const getHeaders = (event: any) => {
  let headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Origin": "",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE,PATCH",
    "Access-Control-Allow-Credentials": true,
  };

  const validDomains = [
    "http://localhost:8080",
    "https://workflows.dev.euler.tools",
  ];

  validDomains.forEach((domain) => {
    if (event.headers.referer && event.headers.referer.includes(domain)) {
      headers["Access-Control-Allow-Origin"] = domain;
    }
  });

  return headers;
};
