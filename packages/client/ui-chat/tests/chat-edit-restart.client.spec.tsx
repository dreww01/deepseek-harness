// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MessageIconActions } from '../src/client/chat/MessageIconActions.tsx'
import { UserMessageNodeView } from '../src/client/chat/MessageItem.tsx'
import { en, zh } from '../src/client/locale.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { ChatConversationViewNode } from '../src/client/contract/chat-nodes.ts'
import type { ChatNodeViewProps } from '../src/client/contract/slots.ts'

const tZh = makeTranslate(zh, commonZh)
const tEn = makeTranslate(en, commonEn)

afterEach(() => {
  cleanup()
})

describe('Edit & Restart: MessageIconActions', () => {
  it('renders both Copy and Edit buttons when onEdit is provided', () => {
    const onEdit = vi.fn()
    render(
      <MessageIconActions
        text="test prompt"
        clock="start"
        onEdit={onEdit}
        t={tZh}
      />,
    )
    const copyBtn = screen.getByRole('button', { name: '复制' })
    const editBtn = screen.getByRole('button', { name: '编辑' })
    expect(copyBtn).toBeTruthy()
    expect(editBtn).toBeTruthy()

    fireEvent.click(editBtn)
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('omits Edit button when onEdit is not provided', () => {
    render(
      <MessageIconActions
        text="test prompt"
        clock="start"
        t={tZh}
      />,
    )
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
  })

  it('renders English labels properly', () => {
    const onEdit = vi.fn()
    render(
      <MessageIconActions
        text="test prompt"
        clock="start"
        onEdit={onEdit}
        t={tEn}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })
})

describe('Edit & Restart: UserMessageNodeView & UserStyleBubble', () => {
  const mockNodeOwner = {
    renderMessageImages: vi.fn(),
    openFile: vi.fn(),
    openSkill: vi.fn(),
    inspectCall: vi.fn(),
    forkAt: vi.fn(),
    loadImage: vi.fn(),
    fileMentions: vi.fn(),
  }

  function createUserNode(text: string, kind: 'user' | 'steering' = 'user'): ChatConversationViewNode {
    return {
      key: `node:${kind}:1`,
      kind,
      id: '1',
      target: 'chat',
      anchorSeq: 1,
      location: {
        kind: 'turn',
        turn: {
          turn: 1,
          start: undefined,
          end: undefined,
          status: 'closed',
          steps: [],
          data: { get: () => undefined, source: () => ({} as never) },
        },
      },
      visibility: 'visible',
      data: {
        kind,
        seq: 1,
        time: 1000,
        content: [{ type: 'text', text }],
        source: null,
      } as never,
    }
  }

  function renderUserNode(
    node: ChatConversationViewNode,
    onEditRestart?: ((node: ChatConversationViewNode, newText: string) => Promise<void>) | undefined,
  ) {
    const props = {
      ...mockNodeOwner,
      node,
      onEditRestart,
      t: tZh,
    } as unknown as ChatNodeViewProps<'user' | 'steering'>
    return render(<UserMessageNodeView {...props} />)
  }

  it('allows clicking Edit, modifying text in textarea, and clicking Cancel', () => {
    const node = createUserNode('initial question')
    const onEditRestart = vi.fn()

    renderUserNode(node, onEditRestart)

    // Initial state: shows text and edit button
    expect(screen.getByText('initial question')).toBeTruthy()
    const editBtn = screen.getByRole('button', { name: '编辑' })
    fireEvent.click(editBtn)

    // Editing state: textarea and Cancel/Send buttons appear
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('initial question')
    const cancelBtn = screen.getByRole('button', { name: '取消' })
    const sendBtn = screen.getByRole('button', { name: '发送' })
    expect(cancelBtn).toBeTruthy()
    expect(sendBtn).toBeTruthy()

    // Modify text
    fireEvent.change(textarea, { target: { value: 'updated question' } })
    expect(textarea.value).toBe('updated question')

    // Click Cancel -> restores original without calling onEditRestart
    fireEvent.click(cancelBtn)
    expect(onEditRestart).not.toHaveBeenCalled()
    expect(screen.getByText('initial question')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('exits edit mode when Escape key is pressed', () => {
    const node = createUserNode('escape test')
    const onEditRestart = vi.fn()

    renderUserNode(node, onEditRestart)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'changed text' } })

    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(screen.getByText('escape test')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('submits updated text on Send click and calls onEditRestart', async () => {
    const node = createUserNode('first prompt')
    const onEditRestart = vi.fn().mockResolvedValue(undefined)

    renderUserNode(node, onEditRestart)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'revised prompt' } })

    const sendBtn = screen.getByRole('button', { name: '发送' })
    await act(async () => {
      fireEvent.click(sendBtn)
    })

    expect(onEditRestart).toHaveBeenCalledWith(node, 'revised prompt')
  })

  it('submits on Ctrl+Enter / Cmd+Enter key combinations', async () => {
    const node = createUserNode('shortcut prompt')
    const onEditRestart = vi.fn().mockResolvedValue(undefined)

    renderUserNode(node, onEditRestart)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'shortcut prompt updated' } })

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    })

    expect(onEditRestart).toHaveBeenCalledWith(node, 'shortcut prompt updated')
  })

  it('disables Send button when textarea is empty or whitespace-only', () => {
    const node = createUserNode('non-empty')
    const onEditRestart = vi.fn()

    renderUserNode(node, onEditRestart)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '   ' } })

    const sendBtn = screen.getByRole('button', { name: '发送' })
    expect(sendBtn.hasAttribute('disabled')).toBe(true)

    fireEvent.click(sendBtn)
    expect(onEditRestart).not.toHaveBeenCalled()
  })

  it('keeps edit mode open when onEditRestart fails', async () => {
    const node = createUserNode('prompt that fails')
    const onEditRestart = vi.fn().mockRejectedValue(new Error('network error'))

    renderUserNode(node, onEditRestart)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'prompt attempted' } })

    const sendBtn = screen.getByRole('button', { name: '发送' })
    await act(async () => {
      fireEvent.click(sendBtn)
    })

    expect(onEditRestart).toHaveBeenCalledWith(node, 'prompt attempted')
    // Still in edit mode with user's text preserved
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('prompt attempted')
  })

  it('does not offer Edit button for steering messages', () => {
    const node = createUserNode('steering prompt', 'steering')
    const onEditRestart = vi.fn()

    renderUserNode(node, onEditRestart)

    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
  })
})
