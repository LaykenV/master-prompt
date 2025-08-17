# Plan: Multi-Model Responses with Convex Workflows

The core idea is to use a "master" thread for the main conversation and create temporary, hidden threads for each of the secondary models for a given prompt. A Convex Workflow will orchestrate the entire process, from sending the prompt to all models to generating the final, synthesized answer.

## 1. Data Modeling & Schema (`convex/schema.ts`)

To track the relationship between the user's prompt in the main thread and the temporary threads for other models, we will create a new table.

- **Create new `multiModelRuns` table**:
  - This table will link a user's message in the "master" thread to the temporary threads of the secondary models.
  - **Fields**:
    - `masterMessageId`: The ID of the user's message.
    - `masterThreadId`: The ID of the main conversation thread.
    - `secondaryRuns`: An array of objects, each containing a `modelId` and the `threadId` of the temporary thread for that model.

## 2. Backend Implementation (`convex/chat.ts` & `convex/workflows.ts`)

The backend will be responsible for orchestrating the multi-model generation.

- **Create a new `startMultiModelGeneration` action in `convex/chat.ts`**:
  - This action will be called from the UI when the user sends a prompt with multiple models selected.
  - It will save the user's initial message to the master thread.
  - It will then trigger a new workflow to handle the rest of the process, passing it the necessary information (master thread ID, message ID, prompt, and the list of selected models).

- **Create a `multiModelGeneration` workflow in `convex/workflows.ts`**:
  This workflow will execute the following steps:
  1.  **Setup**: Create new, temporary threads for each secondary model.
  2.  **Record Keeping**: Create an entry in the `multiModelRuns` table to link the master message with the new temporary threads.
  3.  **Fan-out (Parallel Generation)**: In parallel, call an action to generate a response from each model (both master and secondary) in its respective thread.
  4.  **Join**: Wait for all models to complete their responses.
  5.  **Synthesize**: Construct a new, detailed prompt for the master model. This prompt will include the original question and all the generated answers.
  6.  **Final Response**: Call an action one last time to make the master model generate the final, synthesized answer in the master thread. This final response can be streamed to the UI.

## 3. UI & Frontend (`app/chat/[threadId]/page.tsx` & `components/ModelPicker.tsx`)

The user interface will need to be updated to support selecting multiple models and displaying their responses in real-time.

- **Update `ModelPicker.tsx`**:
  - Modify the component to allow selecting one "master" model and multiple "secondary" models.

- **Update `app/chat/[threadId]/page.tsx`**:
  - When the user sends a message with multiple models, it will call the new `startMultiModelGeneration` action.
  - The page will query the `multiModelRuns` table to find the temporary threads associated with the user's prompt.
  - It will then use `useThreadMessages` to listen for and stream messages from the master thread and all the temporary secondary threads.

- **Create a new `MultiResponseMessage` component**:
  - This component will be responsible for rendering the multiple, parallel-streaming responses from each model.
  - The user's original message will be "absorbed" into this component and will not be shown as a separate bubble in the main chat flow.
  - The final, synthesized response from the master model will appear as a normal assistant message below the `MultiResponseMessage`.
