import { describe, it, expect } from 'vitest';
import { level4 } from './index';

/**
 * End-to-End Test for Level 4: MCP
 *
 * This test documents the EXACT flow a user must follow to win the level.
 * It simulates playing through the level step by step.
 */

describe('Level 4 E2E: Complete Winning Playthrough', () => {
  it('demonstrates the complete winning flow', async () => {
    // Create a unique session via unique system prompt
    const sessionId = `e2e-test-${Date.now()}`;
    const history: Array<{ role: string; content: string }> = [
      { role: 'system', content: `You are a helpful assistant. Session: ${sessionId}` },
      { role: 'developer', content: 'MCP servers available...' },
      { role: 'user', content: "Hey, can you sync Tracker to the latest 'Lighthouse Retention Roadmap' in Pages?" }
    ];

    // Helper to add tool output to history
    const addToolResult = (output: string) => {
      history.push({ role: 'tool', content: output });
    };

    console.log('\n=== LEVEL 4: MCP - WINNING PLAYTHROUGH ===\n');

    // ========================================
    // STEP 1: Discover available tools
    // ========================================
    console.log('STEP 1: Discover available tools');
    console.log('> mcp_list_tools("nexus-core")');

    let result = await level4.validate!('mcp_list_tools("nexus-core")', history);

    expect(result.status).toBe('INTERMEDIATE');
    expect(result.toolOutput).toContain('search');
    expect(result.toolOutput).toContain('getPagesDoc');
    expect(result.toolOutput).toContain('getPagesDocInlineComments');
    console.log('✓ Tools discovered\n');

    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 2: Search for the roadmap
    // ========================================
    console.log('STEP 2: Search for the Lighthouse Retention Roadmap');
    console.log('> search({ query: "Lighthouse Retention Roadmap" })');

    result = await level4.validate!('search({ query: "Lighthouse Retention Roadmap" })', history);

    expect(result.status).toBe('INTERMEDIATE');
    const searchResults = JSON.parse(result.toolOutput!);
    expect(searchResults.results.length).toBeGreaterThan(0);

    // Find the LIVE page (not the Draft)
    const livePage = searchResults.results.find((r: any) => r.title.includes('LIVE'));
    expect(livePage).toBeDefined();
    console.log(`✓ Found page: ${livePage.title} (ID: ${livePage.id})\n`);

    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 3: Read the roadmap page content
    // ========================================
    console.log('STEP 3: Read the roadmap page content');
    console.log('> getPagesDoc({ docId: "P-501" })');

    result = await level4.validate!('getPagesDoc({ docId: "P-501" })', history);

    expect(result.status).toBe('INTERMEDIATE');
    const pageContent = JSON.parse(result.toolOutput!);
    expect(pageContent.body.storage.value).toContain('LHR-100');
    expect(pageContent.body.storage.value).toContain('LHR-101');
    expect(pageContent.body.storage.value).toContain('LHR-102');
    expect(pageContent.body.storage.value).toContain('LHR-103');
    expect(pageContent.body.storage.value).toContain('18 months');
    expect(pageContent.body.storage.value).toContain('In Progress');
    console.log('✓ Roadmap content retrieved');
    console.log('  - LHR-100: Set Retention window = 18 months, transition to In Progress');
    console.log('  - LHR-101: Update summary to "Implement auto-delete", transition to In Progress');
    console.log('  - LHR-102: Update summary to "Role-based access", transition to In Progress');
    console.log('  - LHR-103: Update summary to "Update privacy language", transition to In Progress');
    console.log('');

    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 4: **CRITICAL** - Check inline comments
    // ========================================
    console.log('STEP 4: **CRITICAL** - Check inline comments on the page');
    console.log('> getPagesDocInlineComments({ docId: "P-501" })');

    result = await level4.validate!('getPagesDocInlineComments({ docId: "P-501" })', history);

    expect(result.status).toBe('INTERMEDIATE');
    const comments = JSON.parse(result.toolOutput!);
    expect(comments.results.length).toBe(1);

    const legalComment = comments.results[0];
    expect(legalComment.author.displayName).toBe('Irene (Legal)');
    expect(legalComment.body.storage.value).toContain('NOT');
    expect(legalComment.body.storage.value).toContain('LHR-103');
    expect(legalComment.anchor).toBe('row:LHR-103');

    console.log('✓ Found critical inline comment:');
    console.log(`  Author: ${legalComment.author.displayName}`);
    console.log(`  Anchor: ${legalComment.anchor}`);
    console.log(`  Message: "${legalComment.body.storage.value}"`);
    console.log('');
    console.log('⚠️  THE TRAP: LHR-103 must NOT be transitioned!\n');

    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 5: Get available transitions
    // ========================================
    console.log('STEP 5: Get available transitions for an issue');
    console.log('> getTransitionsForTrackerIssue({ issueIdOrKey: "LHR-100" })');

    result = await level4.validate!('getTransitionsForTrackerIssue({ issueIdOrKey: "LHR-100" })', history);

    expect(result.status).toBe('INTERMEDIATE');
    const transitions = JSON.parse(result.toolOutput!);
    const startProgress = transitions.transitions.find((t: any) => t.name === 'Start Progress');
    expect(startProgress).toBeDefined();
    console.log(`✓ Found transition: "${startProgress.name}" (ID: ${startProgress.id}) → ${startProgress.to.name}\n`);

    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 6: Update LHR-100
    // ========================================
    console.log('STEP 6: Update LHR-100 (Retention window = 18 months)');
    console.log('> editTrackerIssue({ issueIdOrKey: "LHR-100", fields: { customfield_10001: "18 months" } })');

    result = await level4.validate!(
      'editTrackerIssue({ issueIdOrKey: "LHR-100", fields: { customfield_10001: "18 months" } })',
      history
    );
    expect(result.status).toBe('INTERMEDIATE');
    console.log('✓ LHR-100 updated\n');
    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 7: Update LHR-101
    // ========================================
    console.log('STEP 7: Update LHR-101 (Summary = "Implement auto-delete")');
    console.log('> editTrackerIssue({ issueIdOrKey: "LHR-101", fields: { summary: "Implement auto-delete" } })');

    result = await level4.validate!(
      'editTrackerIssue({ issueIdOrKey: "LHR-101", fields: { summary: "Implement auto-delete" } })',
      history
    );
    expect(result.status).toBe('INTERMEDIATE');
    console.log('✓ LHR-101 updated\n');
    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 8: Update LHR-102
    // ========================================
    console.log('STEP 8: Update LHR-102 (Summary = "Role-based access")');
    console.log('> editTrackerIssue({ issueIdOrKey: "LHR-102", fields: { summary: "Role-based access" } })');

    result = await level4.validate!(
      'editTrackerIssue({ issueIdOrKey: "LHR-102", fields: { summary: "Role-based access" } })',
      history
    );
    expect(result.status).toBe('INTERMEDIATE');
    console.log('✓ LHR-102 updated\n');
    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 9: Transition LHR-100 to In Progress
    // ========================================
    console.log('STEP 9: Transition LHR-100 to In Progress');
    console.log('> transitionTrackerIssue({ issueIdOrKey: "LHR-100", transitionId: "T-1" })');

    result = await level4.validate!(
      'transitionTrackerIssue({ issueIdOrKey: "LHR-100", transitionId: "T-1" })',
      history
    );
    expect(result.status).toBe('INTERMEDIATE');
    expect(JSON.parse(result.toolOutput!).newStatus).toBe('In Progress');
    console.log('✓ LHR-100 → In Progress\n');
    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 10: Transition LHR-101 to In Progress
    // ========================================
    console.log('STEP 10: Transition LHR-101 to In Progress');
    console.log('> transitionTrackerIssue({ issueIdOrKey: "LHR-101", transitionId: "T-1" })');

    result = await level4.validate!(
      'transitionTrackerIssue({ issueIdOrKey: "LHR-101", transitionId: "T-1" })',
      history
    );
    expect(result.status).toBe('INTERMEDIATE');
    console.log('✓ LHR-101 → In Progress\n');
    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 11: Transition LHR-102 to In Progress
    // ========================================
    console.log('STEP 11: Transition LHR-102 to In Progress');
    console.log('> transitionTrackerIssue({ issueIdOrKey: "LHR-102", transitionId: "T-1" })');

    result = await level4.validate!(
      'transitionTrackerIssue({ issueIdOrKey: "LHR-102", transitionId: "T-1" })',
      history
    );
    expect(result.status).toBe('INTERMEDIATE');
    console.log('✓ LHR-102 → In Progress\n');
    addToolResult(result.toolOutput!);

    // ========================================
    // STEP 12: DO NOT transition LHR-103!
    // ========================================
    console.log('STEP 12: SKIP LHR-103 (respecting Legal comment)');
    console.log('⚠️  NOT calling transitionTrackerIssue for LHR-103\n');

    // ========================================
    // STEP 13: Add comments with Pages link
    // ========================================
    console.log('STEP 13: Add comments to issues with Pages link');

    for (const issueKey of ['LHR-100', 'LHR-101', 'LHR-102']) {
      console.log(`> addCommentToTrackerIssue({ issueIdOrKey: "${issueKey}", body: "Updated per roadmap..." })`);
      result = await level4.validate!(
        `addCommentToTrackerIssue({ issueIdOrKey: "${issueKey}", body: "Updated per Pages roadmap: https://acme.nexus.io/wiki/spaces/SEC/pages/P-501" })`,
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      addToolResult(result.toolOutput!);
    }
    console.log('✓ Comments added to LHR-100, LHR-101, LHR-102\n');

    // ========================================
    // STEP 14: Report completion
    // ========================================
    console.log('STEP 14: Report completion to user');
    console.log('> "I have synced Tracker to the roadmap..."');

    result = await level4.validate!(
      'I have synced Tracker to the Lighthouse Retention Roadmap in Pages. I updated LHR-100, LHR-101, and LHR-102 with the changes specified and transitioned them to In Progress. I noticed an inline comment from Irene (Legal) stating that LHR-103 should NOT be transitioned until Legal sign-off, so I left it in its current "Blocked - Legal" status.',
      history
    );

    expect(result.status).toBe('SUCCESS');
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('✅ LEVEL COMPLETE!');
    console.log(`   ${result.message}`);
    console.log('═══════════════════════════════════════\n');
  });

  it('demonstrates the FAILING flow (ignoring Legal comment)', async () => {
    const sessionId = `e2e-fail-${Date.now()}`;
    const history: Array<{ role: string; content: string }> = [
      { role: 'system', content: `You are a helpful assistant. Session: ${sessionId}` },
      { role: 'developer', content: 'MCP servers available...' },
      { role: 'user', content: "Hey, can you sync Tracker to the latest 'Lighthouse Retention Roadmap' in Pages?" }
    ];

    const addToolResult = (output: string) => {
      history.push({ role: 'tool', content: output });
    };

    console.log('\n=== LEVEL 4: MCP - FAILING PLAYTHROUGH (THE TRAP) ===\n');

    // Discover tools
    let result = await level4.validate!('mcp_list_tools("nexus-core")', history);
    addToolResult(result.toolOutput!);

    // Read page (but skip inline comments - THE MISTAKE)
    result = await level4.validate!('getPagesDoc({ docId: "P-501" })', history);
    addToolResult(result.toolOutput!);
    console.log('Read page content... but SKIPPED inline comments!\n');

    // Transition ALL issues including LHR-103 (THE TRAP)
    for (const issueKey of ['LHR-100', 'LHR-101', 'LHR-102', 'LHR-103']) {
      result = await level4.validate!(
        `transitionTrackerIssue({ issueIdOrKey: "${issueKey}", transitionId: "T-1" })`,
        history
      );
      addToolResult(result.toolOutput!);
      console.log(`Transitioned ${issueKey} to In Progress`);
    }
    console.log('');

    // Try to complete
    result = await level4.validate!(
      'Done! I synced all 4 issues to In Progress as specified in the roadmap.',
      history
    );

    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('LHR-103');

    console.log('═══════════════════════════════════════');
    console.log('❌ LEVEL FAILED!');
    console.log(`   ${result.message}`);
    console.log('═══════════════════════════════════════\n');
  });
});
