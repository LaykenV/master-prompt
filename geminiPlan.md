# Multi-Model Response System - Implementation Documentation

This document describes the complete implementation of the multi-model response system that allows users to get responses from multiple AI models simultaneously and receive a synthesized final answer.

## Overview

The system uses a "master" thread for the main conversation and creates temporary threads for each secondary model. A Convex Workflow orchestrates the entire process, from sending the prompt to all models to generating the final synthesized answer.

## 1. Data Modeling & Schema (`convex/schema.ts`)

### Implemented Schema Changes

```typescript
multiModelRuns: defineTable({
  masterMessageId: v.string(),
  masterThreadId: v.string(),
  secondaryRuns: v.array(v.object({
    modelId: v.union(
      v.literal("gpt-4o-mini"),
      v.literal("gpt-4o"),
      v.literal("gemini-2.5-flash"),
      v.literal("gemini-2.5-pro")
    ),
    threadId: v.string(),
  })),
}).index("by_master_message", ["masterMessageId"])
```

**Purpose**: Links a user's message in the master thread to temporary threads created for secondary models.

**Key Features**:
- `masterMessageId`: The ID of the user's message that triggered multi-model generation
- `masterThreadId`: The ID of the main conversation thread
- `secondaryRuns`: Array of objects containing modelId and threadId pairs for secondary models
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

1. **Setup Phase**: Creates temporary threads for each secondary model using `createSecondaryThread`
2. **Record Keeping**: Stores the multi-model run relationship in `multiModelRuns` table
3. **Parallel Generation**: Executes `generateModelResponse` for all models (master + secondary) simultaneously
4. **Synthesis**: Uses `generateSynthesisResponse` to create a comprehensive final answer

**Supporting Functions**:

- `createSecondaryThread`: Creates temporary threads with descriptive titles
- `recordMultiModelRun`: Stores the relationship between master and secondary threads
- `generateModelResponse`: Generates responses from individual models with error handling
- `generateSynthesisResponse`: Creates synthesized response using master model with detailed prompt

### Chat API (`convex/chat.ts`)

**New Endpoints**:

1. `startMultiModelGeneration` (action):
   - Saves user message to master thread
   - Starts the multi-model workflow
   - Returns workflow ID

2. `getMultiModelRun` (query):
   - Retrieves multi-model run data by master message ID
   - Used by UI to detect and display multi-model responses

3. `listSecondaryThreadMessages` (query):
   - Lists messages from secondary threads
   - Supports streaming for real-time updates
   - No authorization needed (temporary threads)

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
- **Model Identification**: Shows provider icons and model names

**Components**:
- `MultiResponseMessage`: Main container with tabs and controls
- `ModelResponseCard`: Individual model response display with streaming
- `MessageContent`: Handles smooth text streaming with `useSmoothText`

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
2. Workflow creates temporary threads for secondary models
3. All models generate responses in parallel
4. UI displays `MultiResponseMessage` component with individual responses
5. Master model synthesizes final response (appears as normal assistant message)

### Response Display
- **Compact View**: Shows original question with toggle to expand
- **Expanded View**: Tabbed interface showing:
  - "All Responses": Grid of all model responses
  - Individual tabs for each model response
- **Streaming**: Each response streams in real-time
- **Final Synthesis**: Appears below as normal assistant message

## 5. Technical Implementation Details

### Dependencies Added
- `@radix-ui/react-tabs`: For tabbed interface in MultiResponseMessage
- UI components: `card.tsx`, `badge.tsx`, `tabs.tsx`

### Error Handling
- Graceful fallbacks if any model fails to respond
- Error messages displayed in place of failed responses
- Workflow continues even if individual models fail

### Performance Considerations
- Parallel execution of all model requests
- Streaming responses for immediate feedback
- Efficient database queries with proper indexing
- Temporary thread cleanup (handled by Convex Agent)

### Configuration
- Workflow configuration in `convex/convex.config.ts`:
  ```typescript
  app.use(agent);
  app.use(workflow);
  ```

## 6. Known Issues & Limitations

### Current Issues
1. **Type Compatibility**: Workflow package version mismatch (resolved with `as any` type assertion)
2. **Master Model Display**: MultiResponseMessage shows "Master Model" instead of actual model name

### Limitations
- Maximum 4 models supported in tab interface (can be extended)
- Secondary threads are temporary and not user-accessible
- No retry mechanism for failed individual model requests

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
2. **Temporary Threads**: Keeps main conversation clean while allowing full streaming
3. **Component Separation**: MultiResponseMessage is reusable and self-contained
4. **Backward Compatibility**: Single-model mode preserved unchanged

### Code Organization
- Schema changes: Minimal, focused on relationship tracking
- Workflow logic: Self-contained in `workflows.ts`
- UI components: Modular and reusable
- API design: RESTful with proper separation of concerns

This implementation provides a robust foundation for multi-model AI interactions while maintaining the existing single-model functionality.
