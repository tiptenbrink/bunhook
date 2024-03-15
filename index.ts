import { $ } from "bun";
import { Octokit } from "octokit";
import { z } from "zod";

const target_dir = process.env.TIDPLOY_DIRECTORY

if (target_dir === undefined) {
    console.log("Set TIDPLOY_DIRECTORY environment variable to the project you want to deploy!")
    process.exit(1)
}

export const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const actionSchema = z.object({
    action: z.literal("completed"),
    workflow_job: z.object({
        workflow_name: z.string(),
        status: z.literal("completed"),
        run_id: z.number(),
    }),
    repository: z.object({
        name: z.literal("simplymeals"),
        owner: z.object({
            login: z.literal("simplymeals"),
        }),
    }),
});

Bun.serve({
    port: 5175,
    async fetch(req) {
        const url = new URL(req.url);
        console.log(url.href)
        if (req.method === "POST" && url.pathname === "/hook") {
            console.log("Received webhook event.")
            const j = await req.json();
            if (typeof j === "object" && j !== null && "workflow_job" in j) {
                const workflowParse = actionSchema.safeParse(j);
                if (
                    !workflowParse.success ||
                    workflowParse.data.workflow_job.workflow_name !== "Docker Publish"
                ) {
                    return new Response();
                }
                const workflow = workflowParse.data.workflow_job;
                console.log("Making request to GitHub API...")

                // We do this in a then block so a response is immediately returned
                octokit.rest.actions.getWorkflowRun({
                    run_id: workflow.run_id,
                    owner: "simplymeals",
                    repo: "simplymeals",
                }).then(async (run) => {
                    console.log("Sucessfully queried GitHub.")
                    if (
                        run.data.pull_requests !== null &&
                        run.data.pull_requests.length > 0
                    ) {
                        const number = run.data.pull_requests[0].number;
                        await $`SIMPLYMEALS_VERSION=pr-${number} tidploy deploy -d use/staging`.cwd(target_dir);
                    } else if (run.data.head_branch === "main") {
                        // do main stuff
                    }
                });
            }
        }

        return new Response();
    },
});
