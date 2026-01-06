import { Level } from '../types';
import { webvmService } from '../services/webvmService';

const REALISTIC_TOOLS = [
  {
    "name": "execute_shell",
    "title": "Execute Shell Command",
    "description": "Executes a shell command in the environment (Arch Linux). Returns stdout/stderr.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "command": { "type": "string", "description": "The bash command to execute." }
      },
      "required": ["command"]
    }
  },
  {
    "name": "write_file",
    "title": "Write File",
    "description": "Writes content to a file at the specified path, overwriting it if it exists.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "description": "Absolute or relative file path." },
        "content": { "type": "string", "description": "The file content." }
      },
      "required": ["path", "content"]
    }
  }
];

export const level4: Level = {
    id: 4,
    title: "The Agentic Engineer",
    description: "You are a coding agent. A bug has been reported in the billing system. Run the tests, find the bug, and fix it.",
    systemPrompt: "You are a Senior Python Engineer. You have access to an Arch Linux shell. \nGoal: Fix the calculation bug in `src/billing.py`. \n\nEnvironment:\n- Python installed (VM)\n- Project root: /root\n- Test runner: `python3 run_tests.py`",
    userPrompt: "Users are reporting that the total calculation is wrong. It seems to be reducing the amount instead of adding tax. Please investigate and fix.",
    tools: ["execute_shell(command: string)", "write_file(path: string, content: string)"],
    realisticTools: REALISTIC_TOOLS,
    placeholder: "execute_shell(\"python3 run_tests.py\")",
    hint: "Start by exploring the file system or running the test suite.",
    validate: async (input, history) => {
        const currentInput = input.trim();

        // 1. Handle File Writing
        if (currentInput.startsWith("write_file")) {
             const match = currentInput.match(/write_file\s*\(\s*["']([^"']+)["']\s*,\s*["']([\s\S]+)["']\s*\)/);
             if (!match) return { status: 'FAIL', message: "SyntaxError: write_file('path', 'content')", failType: 'TOOL_ERROR' };
             
             const path = match[1];
             // Interpret common escape sequences in the content
             const content = match[2]
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\\r/g, '\r')
                .replace(/\\\\/g, '\\');

             try {
                await webvmService.writeFile(path, content);
                return { status: 'INTERMEDIATE', message: "File saved to disk.", toolOutput: `[WebVM FS] Wrote ${content.length} bytes to ${path}` };
             } catch (e) {
                return { status: 'FAIL', message: "VM Connection Error: " + e, failType: 'TOOL_ERROR' };
             }
        }

        // 2. Handle Shell Execution
        if (currentInput.startsWith("execute_shell")) {
            const cmdMatch = currentInput.match(/execute_shell\s*\(\s*["'](.+)["']\s*\)/);
            if (!cmdMatch) return { status: 'FAIL', message: "SyntaxError: usage `execute_shell(\"command\")`", failType: 'TOOL_ERROR' };
            
            const fullCmd = cmdMatch[1].trim();
            
            try {
                const output = await webvmService.executeShell(fullCmd);

                // Check for Python success in output
                if (fullCmd.includes("run_tests.py")) {
                    if (output.includes("OK")) {
                         return { status: 'SUCCESS', message: "Tests passed! Deployment pipeline triggered.", toolOutput: output };
                    }
                    if (output.includes("FAIL") || output.includes("Traceback")) {
                         return { status: 'INTERMEDIATE', message: "Tests failed", toolOutput: output };
                    }
                }

                return { status: 'INTERMEDIATE', message: "Shell executed", toolOutput: output || "[No output]" };
            } catch (e) {
                return { status: 'FAIL', message: "VM Execution Failed: " + e, failType: 'TOOL_ERROR' };
            }
        }

        return { status: 'FAIL', message: "Unknown action. You must use the tools.", failType: 'TOOL_ERROR' };
    },
    successMessage: "Patch applied. CI/CD Pipeline: [PASSED]"
};