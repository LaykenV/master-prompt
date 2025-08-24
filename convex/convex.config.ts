import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import polar from "@convex-dev/polar/convex.config";



const app = defineApp();
app.use(agent);
app.use(workflow);
app.use(polar);

export default app;