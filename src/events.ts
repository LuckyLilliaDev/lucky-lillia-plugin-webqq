import { Context } from 'cordis'
import { SSEStreamingApi } from 'hono/streaming'
import { ChatType, ElementType, RawMessage } from '@luckylillia-dev/plugin-nt-protocol/api'
import { serializeResult } from './utils'
import { resolveWatchPicUrls } from './messages'

interface NudgeItemInput {
  senderUid: string
  senderUin: number
  senderName: string
  receiverUid: string
  receiverUin: number
  receiverName: string
  displayAction?: string
  displaySuffix?: string
  displayActionImgUrl?: string
}

function buildNudgeItems(input: NudgeItemInput): Record<string, string>[] {
  const action = input.displayAction || '戳了戳'
  const items: Record<string, string>[] = [
    { type: 'qq', uid: input.senderUid, uin: String(input.senderUin), nm: input.senderName },
    { type: 'nor', txt: ` ${action} ` },
  ]
  if (input.displayActionImgUrl) {
    items.push({ type: 'img', src: input.displayActionImgUrl })
  }
  if (input.senderUin && input.receiverUin && input.senderUin === input.receiverUin) {
    items.push({ type: 'nor', txt: '自己' })
  } else {
    items.push({ type: 'qq', uid: input.receiverUid, uin: String(input.receiverUin), nm: input.receiverName })
  }
  if (input.displaySuffix) {
    items.push({ type: 'nor', txt: input.displaySuffix })
  }
  return items
}

let nudgeSeq = 0

function createNudgeMessage(params: {
  chatType: ChatType
  peerUin: number
  peerUid: string
  peerName: string
  senderUin: number
  senderUid: string
  sendNickName: string
  items: Record<string, string>[]
}): Record<string, unknown> {
  const nowMs = Date.now()
  const msgId = `nudge_${nowMs}_${++nudgeSeq}`
  return {
    msgId,
    msgSeq: '',
    msgTime: Math.floor(nowMs / 1000),
    chatType: params.chatType,
    peerUin: params.peerUin,
    peerUid: params.peerUid,
    peerName: params.peerName,
    senderUin: params.senderUin,
    senderUid: params.senderUid,
    sendNickName: params.sendNickName,
    sendMemberName: '',
    elements: [
      {
        elementType: ElementType.GrayTip,
        elementId: `${msgId}_0`,
        grayTipElement: {
          subElementType: 17,
          jsonGrayTipElement: {
            busiId: '1061',
            jsonStr: JSON.stringify({ items: params.items }),
          },
        },
      },
    ],
  }
}

/** Pushes the NT events the WebQQ page shows live to its SSE clients. */
export function forwardEvents(ctx: Context, sseClients: Set<SSEStreamingApi>) {
  const broadcastMessage = (event: string, data: unknown) => {
    const serializedData = serializeResult(data)
    const message = `event: ${event}\ndata: ${JSON.stringify(serializedData)}\n\n`
    for (const client of sseClients) {
      client.write(message)
    }
  }

  const fillPeerUin = async (message: RawMessage) => {
    if (message.chatType === ChatType.C2C && (!message.peerUin || message.peerUin === 0) && message.peerUid) {
      const uin = await ctx.ntUserApi.getUinByUid(message.peerUid)
      if (uin) {
        message.peerUin = uin
      }
    }
  }

  const resolveGroupMemberName = async (groupCode: number, uin: number, uid?: string): Promise<string> => {
    try {
      const card = await ctx.store.getGroupMemberCardName(groupCode, uin)
      if (card) return card
    } catch { /* ignore */ }
    if (uid) {
      try {
        const user = await ctx.ntUserApi.getUserByUid(uid)
        if (user?.nick) return user.nick
      } catch { /* ignore */ }
    }
    return String(uin)
  }

  const resolveGroupName = async (groupCode: number): Promise<string> => {
    try {
      const groups = await ctx.ntGroupApi.getGroups(false)
      const hit = groups.find(g => Number(g.groupCode) === Number(groupCode))
      if (hit?.groupName) return hit.groupName
    } catch { /* ignore */ }
    return ''
  }

  const resolveFriendName = async (uin: number, uid?: string): Promise<string> => {
    try {
      const result = await ctx.ntFriendApi.getFriends(false)
      const list = Array.isArray(result) ? result : result?.friends ?? []
      const hit = list.find(f => Number(f.uin) === Number(uin))
      if (hit) return hit.remark || hit.nick || String(uin)
    } catch { /* ignore */ }
    if (uid) {
      try {
        const user = await ctx.ntUserApi.getUserByUid(uid)
        if (user?.nick) return user.nick
      } catch { /* ignore */ }
    }
    return String(uin)
  }

  // 别人发的, 或自己在其它客户端发的
  ctx.on('nt/message-created', async (data) => {
    if (sseClients.size === 0) return
    await fillPeerUin(data.message)
    await resolveWatchPicUrls(ctx, data.message)
    broadcastMessage('message', { type: 'message-created', data: data.message })
  })

  // 自己经 bot 发的; 没有它, FE 删掉临时气泡后等不到真消息回填
  ctx.on('nt/message-sent', async (data) => {
    if (sseClients.size === 0) return
    await fillPeerUin(data.message)
    await resolveWatchPicUrls(ctx, data.message)
    broadcastMessage('message', { type: 'message-sent', data: data.message })
  })

  ctx.on('nt/message-deleted', async (data) => {
    if (sseClients.size === 0) return
    broadcastMessage('message', {
      type: 'message-deleted',
      data: {
        msgId: data.msgId,
        msgSeq: data.msgSeq.toString(),
        chatType: data.chatType,
        peerUid: data.peerUid,
        peerUin: data.peerUin.toString(),
        operatorUid: data.operatorUid,
        operatorNick: '',
        isSelfOperate: data.senderUin === data.operatorUin,
        wording: data.displaySuffix
      }
    })
  })

  ctx.on('nt/group-message-reaction', async (data) => {
    if (sseClients.size === 0) return
    let userName = ''
    try {
      userName = (await ctx.store.getGroupMemberCardName(data.groupCode, data.operatorUin)) || ''
    } catch { /* 查不到名字就留空, 不影响表情显示 */ }
    broadcastMessage('message', {
      type: 'emoji-reaction',
      data: {
        groupCode: data.groupCode.toString(),
        msgSeq: data.msgSeq.toString(),
        emojiId: data.faceId.toString(),
        userId: data.operatorUin.toString(),
        userName,
        isAdd: data.isAdd,
      }
    })
  })

  ctx.on('nt/group-nudge', async (data) => {
    if (sseClients.size === 0) return
    const [senderName, receiverName, groupName] = await Promise.all([
      resolveGroupMemberName(data.groupCode, data.senderUin, data.senderUid),
      data.receiverUin === data.senderUin
        ? Promise.resolve('')
        : resolveGroupMemberName(data.groupCode, data.receiverUin, data.receiverUid),
      resolveGroupName(data.groupCode),
    ])
    const items = buildNudgeItems({
      senderUid: data.senderUid || '',
      senderUin: data.senderUin,
      senderName,
      receiverUid: data.receiverUid || '',
      receiverUin: data.receiverUin,
      receiverName,
      displayAction: data.displayAction,
      displaySuffix: data.displaySuffix,
      displayActionImgUrl: data.displayActionImgUrl,
    })
    broadcastMessage('message', {
      type: 'message-created',
      data: createNudgeMessage({
        chatType: ChatType.Group,
        peerUin: data.groupCode,
        peerUid: String(data.groupCode),
        peerName: groupName,
        senderUin: data.senderUin,
        senderUid: data.senderUid || '',
        sendNickName: senderName,
        items,
      }),
    })
  })

  ctx.on('nt/friend-nudge', async (data) => {
    if (sseClients.size === 0) return
    const selfInfo = ctx.qqProtocol.selfInfo
    const selfUin = Number(selfInfo.uin) || 0
    const selfUid = selfInfo.uid || ''
    const friendName = await resolveFriendName(data.uin, data.uid)
    const senderUin = data.isSelfSend ? selfUin : data.uin
    const senderUid = data.isSelfSend ? selfUid : (data.uid || '')
    const senderName = data.isSelfSend ? (selfInfo.nick || '你') : friendName
    const receiverUin = data.isSelfReceive ? selfUin : data.uin
    const receiverUid = data.isSelfReceive ? selfUid : (data.uid || '')
    const receiverName = data.isSelfReceive ? (selfInfo.nick || '你') : friendName
    const items = buildNudgeItems({
      senderUid,
      senderUin,
      senderName,
      receiverUid,
      receiverUin,
      receiverName,
      displayAction: data.displayAction,
      displaySuffix: data.displaySuffix,
      displayActionImgUrl: data.displayActionImgUrl,
    })
    broadcastMessage('message', {
      type: 'message-created',
      data: createNudgeMessage({
        chatType: ChatType.C2C,
        peerUin: data.uin,
        peerUid: data.uid || '',
        peerName: friendName,
        senderUin,
        senderUid,
        sendNickName: friendName,
        items,
      }),
    })
  })

  // TODO: 监听群通知事件（加群申请、邀请入群、被踢等）

  // TODO: 监听好友申请事件

  // TODO: 监听群解散事件

  // TODO: 监听主动退群事件（可能并没有这个事件）
}
