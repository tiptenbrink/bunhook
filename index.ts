import { Webhooks } from "@octokit/webhooks";
import { $ } from "bun";
import { Octokit } from "octokit";

const target_dir = process.env.TIDPLOY_DIRECTORY
const webhook_secret = process.env.WEBHOOK_SECRET

if (target_dir === undefined) {
    console.log("Set TIDPLOY_DIRECTORY environment variable to the project you want to deploy!")
    process.exit(1)
}
if (webhook_secret === undefined) {
    console.log("Set WEBHOOK_SECRET to verify incoming payloads!")
    process.exit(1)
}

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const webhooks = new Webhooks({ secret: webhook_secret })

webhooks.onAny(() => {
    console.log("Received and verified webhook!")
})

webhooks.on("workflow_job.completed", async ({ payload }) => {
    if (payload.workflow_job.workflow_name !== "Docker Publish") {
        return
    }
    console.log("Received webhook for completed Docker Publish job. Making request to GitHub API...")

    // We do this in a then block so a response is immediately returned
    const run = await octokit.rest.actions.getWorkflowRun({
        run_id: payload.workflow_job.run_id,
        owner: "simplymeals",
        repo: "simplymeals",
    });

    console.log("Sucessfully queried GitHub.")
    if (
        run.data.pull_requests !== null &&
        run.data.pull_requests.length > 0
    ) {
        const number = run.data.pull_requests[0].number;
        await $`tidploy deploy -d use/staging`.cwd(target_dir).env({ ...process.env, SIMPLYMEALS_VERSION: `pr-${number}` });
    } else if (run.data.head_branch === "main") {
        // do main stuff
    }
})

webhooks.on("pull_request.closed", async ({ payload }) => {
    const number = payload.number

    await $`docker compose -p simplymeals-pr-${number} down`;
    await $`docker rmi registry.digitalocean.com/simplymeals/simplymeals:pr-${number}`
});

const port = 5175

console.log(`Starting bunhook on port ${port}...`)

Bun.serve({
    port,
    async fetch(req) {
        const url = new URL(req.url);
        console.log(`${req.method}: ${url.href}`)
        if (req.method === "POST" && url.pathname === "/hook") {
            const eventName = req.headers.get("x-github-event") ?? ''
            if (eventName !== 'pull_request' && eventName !== 'workflow_job') {
                return new Response()
            }
            const j = await req.json();
            if (typeof j !== "object" || j === null) {
                return new Response()
            }

            await webhooks.verifyAndReceive({
                id: req.headers.get("x-github-delivery") ?? '',
                name: eventName,
                payload: JSON.stringify(j),
                signature: req.headers.get("x-hub-signature-256") ?? '',
            })
        }

        return new Response();
    },
});
