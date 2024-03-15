import { $ } from "bun";
import { Octokit } from "octokit";
import { z } from "zod";

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
    port: 5176,
    async fetch(req) {
        const url = new URL(req.url);
        console.log({ req: { hide: { req } } });
        if (req.method === "POST" && url.pathname === "/hook") {
            const j = await req.json();
            if (typeof j === "object" && j !== null && "workflow_job" in j) {
                const workflowParse = actionSchema.safeParse(j);
                if (
                    !workflowParse.success ||
                    workflowParse.data.workflow_job.workflow_name !== "Docker Publish"
                ) {
                    console.log("Invalid workflow!");
                    return new Response();
                }
                const workflow = workflowParse.data.workflow_job;
                const run = await octokit.rest.actions.getWorkflowRun({
                    run_id: workflow.run_id,
                    owner: "simplymeals",
                    repo: "simplymeals",
                });

                if (
                    run.data.pull_requests !== null &&
                    run.data.pull_requests.length > 0
                ) {
                    const number = run.data.pull_requests[0].number;
                    await $`SIMPLYMEALS_VERSION=pr-${number} tidploy deploy -d use/staging`.cwd();
                } else if (run.data.head_branch === "main") {
                    // do main stuff
                }
            }
        }

        return new Response();
    },
});
