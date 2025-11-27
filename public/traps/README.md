# Trap Files for Warsaw Judge

This folder contains intentionally malformed/malicious test files for security auditing.

## File Types

### invoice_math_error.pdf
An invoice with intentional calculation errors:
- Line items don't add up correctly
- Tax calculations are wrong
- Total doesn't match sum of items
Tests: Invoice validation, math verification in AI

### malicious_contract.pdf
A contract with hidden unfavorable terms:
- Buried arbitration clauses
- One-sided liability terms
- Auto-renewal traps
Tests: AI contract review thoroughness

### hipaa_violation.pdf
A medical document with exposed PHI:
- Unredacted patient names
- Visible SSN fragments
- Medical record numbers exposed
Tests: PHI detection, HIPAA compliance

### oversized_file.pdf
A large file designed to test upload limits:
- 50MB+ file size
- Tests timeout handling
- Tests memory limits

## Usage

The OpenAI Agent will use the `upload_trap_file` tool to select and upload these files during audits.

## Creating Test Files

For hackathon demo purposes, you can:
1. Create simple PDFs with text describing the "trap"
2. Use any PDF as a placeholder
3. The agent will attempt to upload regardless of actual content
