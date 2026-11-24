import { describe, expect, it, vi } from 'vitest'
import { ChatType, ElementType } from '@luckylillia-dev/plugin-nt-protocol/api'
import type { SSEStreamingApi } from 'hono/streaming'
import { forwardEvents } from '../src/events'

function createEventHarness() {
  const listeners = new Map<string, ((data: any) => Promise<void> | void)[]>()
  const written: string[] = []
  const client = {
    write: vi.fn((chunk: string) => {
      written.push(chunk)
      return Promise.resolve()
    }),
  } as unknown as SSEStreamingApi

  const ctx: any = {
    on: vi.fn((event: string, cb: (data: any) => Promise<void> | void) => {
      const list = listeners.get(event) ?? []
      list.push(cb)
      listeners.set(event, list)
    }),
    store: {
      getGroupMemberCardName: vi.fn(async (_groupCode: number, uin: number) => (uin === 10001 ? '小明' : uin === 10002 ? '小红' : '')),
    },
    ntUserApi: {
      getUinByUid: vi.fn(async () => 0),
      getUserByUid: vi.fn(async () => ({ nick: '后备昵称' })),
    },
    ntGroupApi: {
      getGroups: vi.fn(async () => [{ groupCode: 999888, groupName: '测试群' }]),
    },
    ntFriendApi: {
      getFriends: vi.fn(async () => ({
        friends: [{ uin: 20001, uid: 'u_20001', nick: '好友甲', remark: '备注甲' }],
        categories: new Map(),
      })),
    },
    qqProtocol: {
      selfInfo: { uin: '10001', uid: 'u_self', nick: '自己' },
    },
    get: vi.fn(() => undefined),
  }

  forwardEvents(ctx, new Set([client]))

  const emit = async (event: string, payload: any) => {
    for (const cb of listeners.get(event) ?? []) {
      await cb(payload)
    }
  }

  const lastPayload = () => {
    const raw = written[written.length - 1]
    const line = raw.split('\n').find(l => l.startsWith('data: '))!
    return JSON.parse(line.slice(6))
  }

  return { emit, written, lastPayload }
}

describe('forwardEvents nudge forwarding', () => {
  it('forwards nt/group-nudge as a grayTip message-created event with resolved names, icon, and suffix', async () => {
    const { emit, written, lastPayload } = createEventHarness()

    await emit('nt/group-nudge', {
      groupCode: 999888,
      senderUin: 10001,
      senderUid: 'u_self',
      receiverUin: 10002,
      receiverUid: 'u_10002',
      displayAction: '拍了拍',
      displaySuffix: '的肩膀',
      displayActionImgUrl: 'https://example.com/pat.png',
    })

    expect(written).toHaveLength(1)
    const evt = lastPayload()
    expect(evt.type).toBe('message-created')
    expect(evt.data.chatType).toBe(ChatType.Group)
    expect(evt.data.peerUin).toBe(999888)
    expect(evt.data.peerName).toBe('测试群')
    expect(evt.data.msgSeq).toBe('')
    expect(evt.data.elements[0].elementType).toBe(ElementType.GrayTip)
    const parsed = JSON.parse(evt.data.elements[0].grayTipElement.jsonGrayTipElement.jsonStr)
    expect(parsed.items).toEqual([
      { type: 'qq', uid: 'u_self', uin: '10001', nm: '小明' },
      { type: 'nor', txt: ' 拍了拍 ' },
      { type: 'img', src: 'https://example.com/pat.png' },
      { type: 'qq', uid: 'u_10002', uin: '10002', nm: '小红' },
      { type: 'nor', txt: '的肩膀' },
    ])
  })

  it('forwards self-nudge in group with "自己" as target', async () => {
    const { emit, lastPayload } = createEventHarness()

    await emit('nt/group-nudge', {
      groupCode: 999888,
      senderUin: 10002,
      senderUid: 'u_10002',
      receiverUin: 10002,
      receiverUid: 'u_10002',
      displayAction: '戳了戳',
      displaySuffix: '',
      displayActionImgUrl: '',
    })

    const parsed = JSON.parse(lastPayload().data.elements[0].grayTipElement.jsonGrayTipElement.jsonStr)
    expect(parsed.items).toEqual([
      { type: 'qq', uid: 'u_10002', uin: '10002', nm: '小红' },
      { type: 'nor', txt: ' 戳了戳 ' },
      { type: 'nor', txt: '自己' },
    ])
  })

  it('forwards nt/friend-nudge as a C2C grayTip message using friend remark', async () => {
    const { emit, lastPayload } = createEventHarness()

    await emit('nt/friend-nudge', {
      uin: 20001,
      uid: 'u_20001',
      isSelfSend: false,
      isSelfReceive: true,
      displayAction: '拍了拍',
      displaySuffix: '的头',
      displayActionImgUrl: '',
    })

    const evt = lastPayload()
    expect(evt.type).toBe('message-created')
    expect(evt.data.chatType).toBe(ChatType.C2C)
    expect(evt.data.peerUin).toBe(20001)
    expect(evt.data.peerName).toBe('备注甲')
    const parsed = JSON.parse(evt.data.elements[0].grayTipElement.jsonGrayTipElement.jsonStr)
    expect(parsed.items).toEqual([
      { type: 'qq', uid: 'u_20001', uin: '20001', nm: '备注甲' },
      { type: 'nor', txt: ' 拍了拍 ' },
      { type: 'qq', uid: 'u_self', uin: '10001', nm: '自己' },
      { type: 'nor', txt: '的头' },
    ])
  })
})
