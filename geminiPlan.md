# Multi-Model Response System - Implementation Documentation

This document describes the complete implementation of the multi-model response system that allows users to get responses from multiple AI models simultaneously and receive a synthesized final answer.

## Overview

The system creates individual sub-threads for ALL selected models (including the master model) to generate their responses in parallel. The master thread is reserved for the final synthesized response. A Convex Workflow orchestrates the entire process, from creating sub-threads to generating the final synthesized answer.

## 1. Data Modeling & Schema (`convex/schema.ts`)

### Implemented Schema Changes

```typescript
multiModelRuns: defineTable({
  masterMessageId: v.string(),
  masterThreadId: v.string(),
  masterModelId: v.union(
    v.literal("gpt-4o-mini"),
    v.literal("gpt-4o"),
    v.literal("gemini-2.5-flash"),
    v.literal("gemini-2.5-pro")
  ),
  allRuns: v.array(v.object({
    modelId: v.union(
      v.literal("gpt-4o-mini"),
      v.literal("gpt-4o"),
      v.literal("gemini-2.5-flash"),
      v.literal("gemini-2.5-pro")
    ),
    threadId: v.string(),
    isMaster: v.boolean(),
  })),
}).index("by_master_message", ["masterMessageId"])
```

**Purpose**: Links a user's message in the master thread to sub-threads created for ALL models (including master).

**Key Features**:
- `masterMessageId`: The ID of the user's message that triggered multi-model generation
- `masterThreadId`: The ID of the main conversation thread (used for synthesis)
- `masterModelId`: Explicitly tracks which model is designated as the master
- `allRuns`: Array of objects containing modelId, threadId, and isMaster flag for ALL models
- `isMaster`: Boolean flag to identify which sub-thread belongs to the master model
- Index on `masterMessageId` for efficient lookups

## 2. Backend Implementation

### Workflow System (`convex/workflows.ts`)

**Workflow Manager Setup**:
```typescript
// Type assertion needed due to API signature mismatch between workflow versions
export const workflow = new WorkflowManager(components.workflow as any);
```

**Main Workflow: `multiModelGeneration`**

The workflow executes these steps:

1. **Setup Phase**: Creates sub-threads for ALL models (including master) using `createSecondaryThread`
2. **Record Keeping**: Stores the multi-model run relationship in `multiModelRuns` table with all sub-thread information
3. **Parallel Generation**: Executes `generateModelResponse` for all models in their respective sub-threads simultaneously
4. **Synthesis**: Uses `generateSynthesisResponse` to create a comprehensive final answer in the master thread

**Supporting Functions**:

- `createSecondaryThread`: Creates sub-threads with descriptive titles for all models
- `recordMultiModelRun`: Stores the relationship between master thread and all sub-threads
- `generateModelResponse`: Generates responses from individual models in their sub-threads with error handling
- `generateSynthesisResponse`: Creates synthesized response in the master thread using all sub-thread responses

### Chat API (`convex/chat.ts`)

**New Endpoints**:

1. `startMultiModelGeneration` (action):
   - Saves user message to master thread
   - Starts the multi-model workflow
   - Returns workflow ID

2. `getMultiModelRun` (query):
   - Retrieves multi-model run data by master message ID
   - Returns `masterModelId` and `allRuns` array with `isMaster` flags
   - Used by UI to detect and display multi-model responses

3. `listSecondaryThreadMessages` (query):
   - Lists messages from sub-threads (all model responses)
   - Supports streaming for real-time updates
   - No authorization needed (temporary threads)

4. `listThreadMessages` (query - enhanced):
   - Enhanced to filter out synthesis prompts from master thread display
   - Shows only user messages and final synthesis responses in master thread

## 3. UI & Frontend Implementation

### Enhanced ModelPicker (`components/ModelPicker.tsx`)

**Features**:
- **Single Model Mode**: Original behavior preserved
- **Multi-Model Mode**: New interface for selecting master + secondary models
- **Visual Indicators**: Different icons (Users vs individual model icons)
- **Master/Secondary Management**: Clear distinction between primary and additional models

**Props Interface**:
```typescript
interface ModelPickerProps {
  threadId?: string;
  className?: string;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  multiModelMode?: boolean;
  onMultiModelChange?: (models: { master: string; secondary: string[] }) => void;
}
```

**UI States**:
- Single model: Shows current model with dropdown
- Multi-model: Shows "X Models" with expandable master/secondary sections

### MultiResponseMessage Component (`components/MultiResponseMessage.tsx`)

**Features**:
- **Tabbed Interface**: View all responses or individual model responses
- **Real-time Streaming**: Each model's response streams live using `useThreadMessages`
- **Expandable Views**: Toggle between compact and expanded response views
- **Master Model Identification**: Shows provider icons, model names, and "(Master)" designation
- **Sub-thread Display**: Shows all individual model responses from their respective sub-threads

**Components**:
- `MultiResponseMessage`: Main container with tabs and controls, updated to handle `allRuns` array
- `ModelResponseCard`: Individual model response display with streaming from sub-threads
- `MessageContent`: Handles smooth text streaming with `useSmoothText`

**Key Updates**:
- Updated to use `allRuns` array instead of separate master/secondary arrays
- Displays master model in its own sub-thread alongside other models
- Shows correct model count based on `allRuns.length`
- Properly identifies master model with "(Master)" suffix

### Updated Chat Page (`app/chat/[threadId]/page.tsx`)

**New Features**:
- **Multi-Model Toggle**: Button to switch between single and multi-model modes
- **Enhanced Send Logic**: Detects multi-model selection and uses appropriate action
- **Message Detection**: `MessageWithMultiModel` component detects multi-model runs
- **Dynamic Send Button**: Shows "Send to X Models" when multiple models selected

**State Management**:
```typescript
const [multiModelMode, setMultiModelMode] = useState(false);
const [multiModelSelection, setMultiModelSelection] = useState<{
  master: string;
  secondary: string[];
}>({ master: "gpt-4o-mini", secondary: [] });
```

## 4. User Experience Flow

### Multi-Model Activation
1. User clicks "Multi-Model" toggle button
2. ModelPicker switches to multi-model interface
3. User selects master model and one or more secondary models
4. Send button updates to show "Send to X Models"

### Message Processing
1. User sends message → `startMultiModelGeneration` action triggered
2. Workflow creates sub-threads for ALL models (including master model)
3. All models generate responses in parallel in their respective sub-threads
4. UI displays `MultiResponseMessage` component with individual responses from all sub-threads
5. After all sub-thread responses complete, synthesis is generated in the master thread
6. Synthesis prompt is saved to master thread but hidden from UI
7. Final synthesis response appears as normal assistant message in master thread

### Response Display
- **Compact View**: Shows original question with toggle to expand
- **Expanded View**: Tabbed interface showing:
  - "All Responses": Grid of all model responses from their sub-threads
  - Individual tabs for each model response (including master model)
- **Streaming**: Each response streams in real-time from respective sub-threads
- **Master Model**: Shows in its own sub-thread with "(Master)" designation
- **Final Synthesis**: Appears separately in master thread as normal assistant message

## 5. Technical Implementation Details

### Dependencies Added
- `@radix-ui/react-tabs`: For tabbed interface in MultiResponseMessage
- UI components: `card.tsx`, `badge.tsx`, `tabs.tsx`

### Error Handling
- Graceful fallbacks if any model fails to respond
- Error messages displayed in place of failed responses
- Workflow continues even if individual models fail

### Performance Considerations
- Parallel execution of all model requests in separate sub-threads
- Streaming responses for immediate feedback from all sub-threads
- Efficient database queries with proper indexing
- Sub-thread cleanup (handled by Convex Agent)
- Optimized synthesis generation after all sub-threads complete

### Configuration
- Workflow configuration in `convex/convex.config.ts`:
  ```typescript
  app.use(agent);
  app.use(workflow);
  ```

## 6. Known Issues & Limitations

### Current Issues
1. **Type Compatibility**: Workflow package version mismatch (resolved with `as any` type assertion)

### Limitations
- Maximum 4 models supported in tab interface (can be extended)
- Sub-threads are temporary and not user-accessible
- No retry mechanism for failed individual model requests
- Synthesis prompt is not filtered from UI (implementation limitation)

## 7. Future Enhancement Opportunities

### Potential Improvements
1. **Model Comparison**: Side-by-side comparison view
2. **Response Rating**: Allow users to rate individual responses
3. **Custom Synthesis Prompts**: User-defined synthesis instructions
4. **Response Export**: Export all responses as markdown/PDF
5. **Model Performance Metrics**: Show response times and token usage
6. **Async Notifications**: Alert when all responses complete

### Technical Enhancements
1. **Better Error Recovery**: Retry failed model requests
2. **Response Caching**: Cache common responses
3. **Model Selection Memory**: Remember user's preferred model combinations
4. **Advanced Synthesis**: Different synthesis strategies (comparative, summary, etc.)

## 8. Development Notes

### Key Design Decisions
1. **Workflow-based**: Ensures reliable parallel execution and proper error handling
2. **Sub-threads for All Models**: Master model gets its own sub-thread, keeping it equal to other models
3. **Master Thread for Synthesis**: Reserved exclusively for final synthesized responses
4. **Component Separation**: MultiResponseMessage is reusable and self-contained
5. **Backward Compatibility**: Single-model mode preserved unchanged
6. **Clear Model Separation**: Each model's response is isolated in its own sub-thread

### Code Organization
- Schema changes: Updated to track master model ID and all sub-thread relationships
- Workflow logic: Enhanced to create sub-threads for all models and handle synthesis separately
- UI components: Updated to display all sub-threads including master model
- API design: Enhanced with proper separation between sub-thread responses and synthesis

## 9. Implementation Summary

This updated implementation provides a cleaner separation of concerns:

### New Architecture Benefits:
1. **Equal Treatment**: All models (including master) get individual sub-threads for responses
2. **Clean Synthesis**: Master thread reserved exclusively for final synthesized answers
3. **Better UX**: Users can clearly see each model's individual response in dedicated sub-threads
4. **Scalable Design**: Easy to add more models without changing the core architecture
5. **Improved Streaming**: Each model streams independently in its own thread

### Workflow Summary:
1. User selects multiple models and sends message
2. System creates sub-threads for each selected model (including master)
3. All models generate responses in parallel in their respective sub-threads
4. UI displays all individual responses using MultiResponseMessage component
5. After all responses complete, synthesis is generated in the master thread
6. Final synthesis appears as a regular assistant message in the main conversation

This implementation provides a robust foundation for multi-model AI interactions while maintaining clear separation between individual model responses and synthesized results.
