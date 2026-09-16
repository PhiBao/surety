# AWS deployment record — Surety

Live as of 2026-09-16. Region `ap-southeast-1` (Singapore).

| | |
|---|---|
| Public URL | **https://13-213-84-28.sslip.io** (valid Let's Encrypt cert, auto-renewing) |
| Instance | `i-00bb8459d45c1cb83` · `t4g.small` · `ap-southeast-1a` |
| Elastic IP | `13.213.84.28` (`eipalloc-0cb786846a6310dd7`) |
| Security group | `sg-019eb5d673577a13d` — inbound 80/443 only, **no SSH port** |
| Root volume | `vol-04c6c6b935a60f7b6` (20 GB gp3, encrypted, DeleteOnTermination=false) |
| Restore point | `snap-05df26d34e0b83584` |
| IAM instance role | `surety-ec2-ssm` (AmazonSSMManagedInstanceCore only) |
| IAM deploy user | `surety-deploy` + customer-managed policy `surety-deploy` (4.8 KB) |
| CLI profile | `surety` (access key written by bootstrap, secret never printed) |
| Budget | `surety-cap`, $25/mo |

## Verified security posture

- **IMDSv2 required** (`HttpTokens=required`), checked via API.
- **Termination protection enabled** (verified `DisableApiTermination=True`).
- **No inbound SSH**; administration is SSM Session Manager → every command is in CloudTrail.
- **App runs unprivileged** (`surety` user, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`,
  write access limited to `/var/lib/surety`).
- **Code is root-owned and world-readable** — the service cannot modify its own code.
- **Secrets** live in `/etc/surety/env` (root, `0600`) and are injected via systemd
  `EnvironmentFile`; never in the repo, never in the app directory.
- Policy guardrails validated by `simulate-principal-policy`: IAM writes, VPC deletion,
  and GPU instances all return `explicitDeny`; `ec2:RunInstances` outside
  `ap-southeast-1` is denied.

## Redeploy

Idempotent — safe to run repeatedly; it updates code, rebuilds, and restarts:

```bash
aws ssm send-command --region ap-southeast-1 --instance-ids i-00bb8459d45c1cb83 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["rm -rf /tmp/surety-src && git clone --depth 1 https://github.com/PhiBao/surety.git /tmp/surety-src -q && bash /tmp/surety-src/docs/aws/setup-instance.sh 2>&1 | tail -20"]'
```

`docs/aws/setup-instance.sh` provisions Node 22 (official tarball — AL2023 caps at
nodejs20), pnpm pinned to the repo's `packageManager`, Caddy (binary + systemd unit),
MySQL-free JSON state dir at `/var/lib/surety`, and both services.

## DNS: why sslip.io

`sslip.io` maps `13-213-84-28.sslip.io` → `13.213.84.28` with no registration.
I flagged a risk (sslip.io is *not* in the Public Suffix List, so Let's Encrypt
rate-limit buckets may be shared) — but the cert issued on the first attempt via
**tls-alpn-01**, and Caddy auto-renews. Renewal is the only residual risk.

**To upgrade to a nicer hostname** (recommended before the final submission if you
want polish): create a free Duck DNS subdomain (`duckdns.org`, on the PSL — verified)
or point your own domain at `13.213.84.28`, then:

```bash
# on the instance via SSM: replace the hostname in the Caddyfile and env, then:
systemctl reload caddy && systemctl restart surety
```

Caddy obtains a new cert automatically; set `PUBLIC_BASE_URL` in `/etc/surety/env`
to the new URL so the x402 challenge advertises it.

## Known gaps (honest list)

1. **SSM command record not purged.** The env-write command's parameters held a
   base64 copy of the secrets. `aws ssm delete-command` is **not present** in this
   CLI build (verified: only `cancel-command`, `list-commands`, `send-command`, …),
   so the record stays in SSM command history under your account. Rotate the OKX
   keys and the testnet adjudicator key after the event.
2. **Nightly snapshots are not automated.** AWS Data Lifecycle Manager needs a
   service role, and the deploy policy deliberately excludes IAM writes. One manual
   restore point exists (`snap-05df26d34e0b83584`). For automation, run with admin:
   ```bash
   aws dlm create-lifecycle-policy --description "surety nightly" \
     --state ENABLED --execution-role-arn <role> \
     --policy-details '{"ResourceTypes":["VOLUME"],"TargetTags":[{"Key":"project","Value":"surety"}],"Schedules":[{"Name":"nightly","CreateRule":{"Interval":24,"IntervalUnit":"HOURS","Times":["18:00"]},"RetainRule":{"Count":7}}]}'
   ```
3. **Single-EVM adjudicator.** The settle route signs with one key (testnet).
   Rotate via `setAdjudicator` to the evaluator service before mainnet; the
   receipt's evidence logs are public so disputes are reviewable.

## Teardown (after the finale)

```bash
export AWS_PROFILE=surety REGION=ap-southeast-1
ID=i-00bb8459d45c1cb83
aws ec2 modify-instance-attribute --region $REGION --instance-id $ID --no-disable-api-termination
aws ec2 terminate-instances --region $REGION --instance-ids $ID
aws ec2 release-address --region $REGION --allocation-id eipalloc-0cb786846a6310dd7
aws ec2 delete-volume --region $REGION --volume-id vol-04c6c6b935a60f7b6
aws ec2 delete-security-group --region $REGION --group-id sg-019eb5d673577a13d
```
Then, with admin: detach and delete the `surety-deploy` managed policy, delete the
access key, delete user `surety-deploy`, and delete role/instance-profile `surety-ec2-ssm`.
