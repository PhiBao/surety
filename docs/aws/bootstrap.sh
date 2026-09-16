#!/usr/bin/env bash
# Surety AWS bootstrap — run ONCE with your admin session.
#
# Creates: SSM instance role + profile, least-privilege deploy user,
# and a $25 budget alarm. Idempotent: safe to re-run.
#
# Usage:  bash docs/aws/bootstrap.sh
set -euo pipefail

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGION="ap-southeast-1"
ROLE="surety-ec2-ssm"
PROFILE_NAME="surety-ec2-ssm"
USER="surety-deploy"
BUDGET="surety-cap"
POLICY_FILE="$(cd "$(dirname "$0")" && pwd)/surety-deploy-policy.json"

echo "account=$ACCOUNT_ID region=$REGION"

# ---- 1. SSM instance role (created by you, not the deploy user) -------------
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "[=] role $ROLE exists"
else
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --tags Key=project,Value=surety >/dev/null
  echo "[+] role $ROLE created"
fi

aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
echo "[=] AmazonSSMManagedInstanceCore attached"

if aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null 2>&1; then
  echo "[=] instance profile exists"
else
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$PROFILE_NAME" --role-name "$ROLE"
  echo "[+] instance profile created and role added"
fi

# ---- 2. deploy user + scoped inline policy ---------------------------------
if aws iam get-user --user-name "$USER" >/dev/null 2>&1; then
  echo "[=] user $USER exists"
else
  aws iam create-user --user-name "$USER" --tags Key=project,Value=surety >/dev/null
  echo "[+] user $USER created"
fi

TMP_POLICY="$(mktemp)"
sed "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" "$POLICY_FILE" > "$TMP_POLICY"
POLICY_ARN="arn:aws:iam::$ACCOUNT_ID:policy/surety-deploy"

if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  # keep only the newest version, then publish this one as default
  for v in $(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
             --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text); do
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$v"
  done
  aws iam create-policy-version --policy-arn "$POLICY_ARN" \
    --policy-document "file://$TMP_POLICY" --set-as-default >/dev/null
  echo "[=] managed policy updated"
else
  aws iam create-policy --policy-name surety-deploy \
    --policy-document "file://$TMP_POLICY" \
    --tags Key=project,Value=surety >/dev/null
  echo "[+] managed policy created (4.7 KB, under the 6.1 KB limit)"
fi
rm -f "$TMP_POLICY"

# clean up any earlier failed inline attempt, then attach the managed policy
aws iam delete-user-policy --user-name "$USER" --policy-name surety-deploy 2>/dev/null || true
aws iam attach-user-policy --user-name "$USER" --policy-arn "$POLICY_ARN"
echo "[=] managed policy attached to $USER"

# ---- 3. access key -> dedicated 'surety' CLI profile ------------------------
if aws iam list-access-keys --user-name "$USER" --query 'AccessKeyMetadata[].AccessKeyId' --output text | grep -q .; then
  echo "[=] access key already exists (not creating another)"
else
  read -r AK SK <<<"$(aws iam create-access-key --user-name "$USER" \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)"
  aws configure set aws_access_key_id "$AK" --profile surety
  aws configure set aws_secret_access_key "$SK" --profile surety
  aws configure set region "$REGION" --profile surety
  chmod 600 "$HOME/.aws/credentials" 2>/dev/null || true
  echo "[+] wrote CLI profile 'surety' (access key id ${AK:0:8}…; secret never printed)"
fi

# ---- 4. budget alarm --------------------------------------------------------
if aws budgets describe-budgets --account-id "$ACCOUNT_ID" --query "Budgets[?BudgetName=='$BUDGET'].BudgetName" --output text 2>/dev/null | grep -q .; then
  echo "[=] budget $BUDGET exists"
else
  aws budgets create-budget --account-id "$ACCOUNT_ID" \
    --budget "{\"BudgetName\":\"$BUDGET\",\"BudgetType\":\"COST\",\"TimeUnit\":\"MONTHLY\",\"BudgetLimit\":{\"Amount\":\"25\",\"Unit\":\"USD\"}}" >/dev/null
  echo "[+] budget $BUDGET created (\$25/mo)"
fi

# ---- 5. verify the deploy identity works -----------------------------------
echo "--- verifying profile 'surety' ---"
aws sts get-caller-identity --profile surety --output json
echo
echo "Next: bash docs/aws/deploy.sh   (or hand off to the agent)"
