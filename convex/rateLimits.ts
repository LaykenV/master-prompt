import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const rateLimiter = new RateLimiter(components.rateLimiter, {
    // Per-user message sending limits (allows bursts of 3, then 10/minute)
    saveMessage: {kind: "token bucket", rate: 10, period: MINUTE, capacity: 3},
    
    // Per-user thread title generation (less critical, higher limit)
    generateThreadTitle: {kind: "token bucket", rate: 20, period: MINUTE},
    
    // Per-user multi-model generation (expensive operation, stricter limit)
    startMultiModelGeneration: {kind: "token bucket", rate: 5, period: MINUTE, capacity: 1},
    
    // Global limits for expensive operations (with sharding for better performance)
    globalLLMRequests: {kind: "fixed window", rate: 1000, period: MINUTE, shards: 5},
});

export default rateLimiter;