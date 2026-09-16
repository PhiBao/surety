# AWS deploy access — least-privilege policy + setup

Goal: give me one IAM user that can deploy and operate **only** the Surety demo
(one EC2 instance + data volume + Elastic IP + SSM shell), nothing else in your
account. 14 statements, 11 Allow / 3 Deny guardrails. Policy file:
[`surety-deploy-policy.json`](./surety-deploy-policy.json).

**Region:** `ap-southeast-1` (Singapore) — closest to the OKX audience/SG finale,
and the A2MCP guide explicitly recommends Singapore/Tokyo/US over Hong Kong for
AI-API reachability. Region is enforced on all mutating EC2 actions.

**Estimated cost:** `t4g.small` ≈ $12/mo + 20 GB gp3 ≈ $1.6/mo + EIP (free while
attached) ≈ **<$15/mo**, covered by credits. A $25 budget alarm is created as
part of setup.

**What gets deployed:** Amazon Linux 2023 (ARM), IMDSv2 required, encrypted root +
data volume, termination protection on, **zero inbound SSH** (admin only via SSM
Session Manager), Security Group open on 80/443 only, `systemd` service running
the Next.js app on :3207 behind Caddy with automatic TLS. `orders.json` lives on
the dedicated data volume so a rebuild doesn't lose state.

---

## Step 1 — create the SSM instance role (you run this once)

This is deliberately **not** delegated to me: letting the deploy user create and
attach IAM roles is a known privilege-escalation path. Four commands, 30 seconds:

```bash
aws iam create-role --role-name surety-ec2-ssm \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy --role-name surety-ec2-ssm \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam create-instance-profile --instance-profile-name surety-ec2-ssm

aws iam add-role-to-instance-profile --instance-profile-name surety-ec2-ssm \
  --role-name surety-ec2-ssm
```

## Step 2 — create the deploy user

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# swap the placeholder in the policy for your real account id
sed "s/<ACCOUNT_ID>/$ACCOUNT_ID/" docs/aws/surety-deploy-policy.json > /tmp/surety-deploy-policy.json

aws iam create-user --user-name surety-deploy

aws iam put-user-policy --user-name surety-deploy \
  --policy-name surety-deploy --policy-document file:///tmp/surety-deploy-policy.json
```

No console login, no groups, no other policies. Then create the key:

```bash
aws iam create-access-key --user-name surety-deploy
```

## Step 3 — budget alarm (30 seconds, protects the credits)

```bash
aws budgets create-budget --account-id "$ACCOUNT_ID" \
  --budget '{"BudgetName":"surety-cap","BudgetType":"COST","TimeUnit":"MONTHLY","BudgetLimit":{"Amount":"25","Unit":"USD"}}'
```

(I also hold `budgets:CreateBudget` so I can add alerts at 50/80/100% during deploy.)

## Step 4 — hand me the credentials

Send me the `AccessKeyId` + `SecretAccessKey` (the value of `OKX`/`AWS` env style
is fine — I will write them to a dedicated `~/.aws` profile, `chmod 600`, **never**
into the repo or any commit). Optional but appreciated: confirm your IAM user name
is exactly `surety-deploy` (the self-simulation statement is scoped to it).

If you'd rather not paste secrets in chat: create the key, then run
`aws configure --profile surety` yourself and tell me to use profile `surety` —
I'll read from that profile instead. Either works.

---

## What the policy allows

| Sid | Purpose |
|---|---|
| `ReadOnlyDiscovery` | EC2/SSM/Route53 describes, `sts:GetCallerIdentity`, `ce:GetCostAndUsage`, budget read |
| `InstanceLifecycle` | Launch/start/stop/reboot/terminate, instance attrs (term-protection, IMDSv2), tags |
| `SecurityGroups` | Create/edit the project SG (80/443 only), scoped to the region |
| `DataVolumesAndSnapshots` | gp3 data volume + nightly snapshots |
| `ElasticIps` | Stable public IP for the DNS record |
| `ShellAccessOverSsm` | Run commands / open sessions **on the tagged instances only** |
| `DnsRecordsOptional` | Only if you have a Route53 zone (see DNS below) |
| `CostGuardBudgets` | Create/modify the budget alarm |
| `PassOnlyProjectInstanceRole` | `iam:PassRole` for `role/surety-*` only, and only to EC2 |
| `SelfCheckPolicySimulation` | Lets me verify my own permissions before touching anything |

## What it deliberately blocks

- **No IAM writes**: cannot create users/keys/logins, cannot edit trust policies,
  cannot create policy versions → no persistence, no escalation via IAM.
- **No org/account/SSO/trail/GuardDuty/KMS-destructive actions** → cannot cover
  tracks or weaken account security.
- **No deleting existing network** (VPC/subnet/IGW/route table/NAT) → your other
  account resources are untouchable.
- **No accelerator/GPU instances** and no RDS/ElastiCache/Redshift/SageMaker/EMR/
  EKS/WorkSpaces → no accidental four-figure spend on credits.
- **No inbound SSH ever**: I never get SSH, and I don't need it — SSM is the only
  shell, which means every command is in CloudTrail.

## Honest disclosure of the residual risk

`ssm:SendCommand` is effectively shell on the instance, so I can read the app's
server-side env (OKX API keys, testnet `ADJUDICATOR_KEY`). Those are demo/testnet
credentials; **rotate all of them after the hackathon**, and if you care about the
OKX keys, revoke them at the dev portal when we're done. That capability is
inherent to any remote deployer and is why I scoped shell access to instances only
and left you an explicit audit trail.

Also note: the `NoAcceleratorInstances` / `OptionalDenyOtherSpend` statements are
protective defaults, not requirements — delete them if you later want those
services under this user.

## DNS / HTTPS options (pick one)

1. **Free, no domain needed (default):** a `*.duckdns.org` subdomain pointing at
   the Elastic IP; Caddy obtains Let's Encrypt automatically. Meets the A2MCP
   "HTTPS tied to a domain" requirement. *[cert issuance to be confirmed at deploy
   time — if Let's Encrypt rejects it we fall back to option 2.]*
2. **You have a domain at Route53:** I create `surety.<yourdomain>` A-record; the
   `DnsRecordsOptional` statement covers it. If the zone is elsewhere (Cloudflare,
   Namecheap), add the CNAME yourself and the Route53 statement can be removed.

## Cleanup / revocation after submissions (25 Sep → 6 Oct)

```bash
aws ec2 terminate-instances --instance-ids <id>          # instance + root volume
aws ec2 release-address --allocation-id <eipalloc-id>
aws ec2 delete-volume --volume-id <data-vol-id>          # if you don't want the data
aws iam delete-user-policy --user-name surety-deploy --policy-name surety-deploy
aws iam delete-access-key --user-name surety-deploy --access-key-id <AKIA...>
aws iam delete-user --user-name surety-deploy
```

Or keep it running through the Singapore finale on 6 Oct (it's ~$0.50/day) and
tear down after. Your call — tell me which and I'll either schedule or execute it.

---

### Optional: if you'd rather I create the role myself

Attach this **temporarily** instead (remove after the first deploy) — it grants
`CreateRole/PutRolePolicy/AttachRolePolicy/CreateInstanceProfile/
AddRoleToInstanceProfile/Get*/TagRole` scoped to `surety-*` names, plus the
`PassRole` above. It is escalation-capable in the narrow sense that a `surety-*`
role's inline policy could be rewritten, so prefer Step 1 unless convenience
outweighs that.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BootstrapProjectRoleOnly",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:GetRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:TagRole",
        "iam:CreateInstanceProfile",
        "iam:GetInstanceProfile",
        "iam:AddRoleToInstanceProfile",
        "iam:TagInstanceProfile",
        "iam:ListInstanceProfilesForRole"
      ],
      "Resource": [
        "arn:aws:iam::<ACCOUNT_ID>:role/surety-*",
        "arn:aws:iam::<ACCOUNT_ID>:instance-profile/surety-*"
      ]
    },
    {
      "Sid": "AttachOnlySsmCoreManagedPolicy",
      "Effect": "Allow",
      "Action": [
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy"
      ],
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/surety-*",
      "Condition": {
        "ArnEquals": {
          "iam:PolicyARN": "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
        }
      }
    }
  ]
}
```
