#!/bin/bash
cd lambda
zip -r ../lambda-deploy.zip *
aws lambda update-function-code \
  --function-name lambdaskilluno \
  --zip-file fileb://../lambda-deploy.zip \
  --region eu-west-1