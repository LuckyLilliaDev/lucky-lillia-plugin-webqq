import type * as NT from '@luckylillia-dev/plugin-nt-protocol/types'
export { ChatType, ElementType } from '@luckylillia-dev/plugin-nt-protocol/types'
export type { TextElement, PicElement, FileElement, FaceElement, ArkElement } from '@luckylillia-dev/plugin-nt-protocol/types'

// The WebQQ JSON representation also carries optional NT client fields and locally cached UI state.
export interface GrayTipElement {
  jsonGrayTipElement?: { jsonStr?: string }
  xmlElement?: { content?: string }
}
export type ReplyElement = NT.ReplyElement & { replayMsgId?: string; replayMsgSeq?: string; sourceMsgText?: string }
export type PttElement = NT.PttElement & { text?: string }
export type MarketFaceElement = NT.MarketFaceElement & { supportSize?: { width?: number; height?: number }[] }
export type VideoElement = Omit<NT.VideoElement, 'thumbPath'> & { thumbPath?: string | Map<number, string> | Record<string, string> }
export type MessageElement = Omit<NT.MessageElement, 'grayTipElement' | 'replyElement' | 'pttElement' | 'marketFaceElement' | 'videoElement'> & {
  elementId?: string
  grayTipElement?: GrayTipElement
  replyElement?: ReplyElement
  pttElement?: PttElement
  marketFaceElement?: MarketFaceElement
  videoElement?: VideoElement
}
export interface EmojiLike { emojiId: string; emojiType: string; likesCnt: string; isClicked?: boolean }
interface MessageAttribute { groupHonor?: { level: number; uniqueTitle?: string } }
export type RawMessage = Omit<NT.RawMessage, 'elements'> & {
  elements: MessageElement[]
  emojiLikesList?: EmojiLike[]
  recallTime?: string
  msgAttrs?: Map<number, MessageAttribute> | Record<string, MessageAttribute>
}

// ChatType: 1=私聊, 2=群聊, 100=临时会话
export type WebChatType = 1 | 2 | 100

export interface FriendItem {
  uid: string
  uin: string
  nickname: string
  remark: string
  avatar: string
  online: boolean
  topTime?: string
}

export interface FriendCategory {
  categoryId: number
  categoryName: string
  categorySort: number
  onlineCount: number
  memberCount: number
  friends: FriendItem[]
}

export interface GroupItem {
  groupCode: string
  groupName: string
  remarkName?: string
  avatar: string
  memberCount: number
  isTop: boolean
  msgMask?: number
}

export interface RecentChatItem {
  chatType: WebChatType
  peerId: string
  peerName: string
  peerAvatar: string
  lastMessage: string
  lastTime: number
  unreadCount: number
  pinned?: boolean
}

export interface ChatSession {
  chatType: WebChatType
  peerId: string
  peerName: string
  peerAvatar: string
}

export interface GroupMemberItem {
  uid: string
  uin: string
  nickname: string
  card: string
  avatar: string
  role: 'owner' | 'admin' | 'member'
  level?: number
  specialTitle?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
}

export interface MessagesResponse {
  messages: RawMessage[]
  hasMore: boolean
}

export interface SendMessageRequest {
  chatType: WebChatType
  peerId: string
  content: {
    type: 'text' | 'image' | 'reply' | 'at' | 'face' | 'file'
    text?: string
    imagePath?: string
    msgId?: string
    msgSeq?: string
    uid?: string
    uin?: string
    name?: string
    faceId?: number
    filePath?: string
    fileName?: string
  }[]
}

export interface UploadResponse {
  imagePath: string
  filename: string
}

export enum GroupNotifyType {
  InvitedByMember = 1,
  RefuseInvited = 2,
  RefusedByAdminiStrator = 3,
  AgreedTojoinDirect = 4,
  InvitedNeedAdminiStratorPass = 5,
  AgreedToJoinByAdminiStrator = 6,
  RequestJoinNeedAdminiStratorPass = 7,
  SetAdmin = 8,
  KickMemberNotifyAdmin = 9,
  KickMemberNotifyKicked = 10,
  MemberLeaveNotifyAdmin = 11,
  CancelAdminNotifyCanceled = 12,
  CancelAdminNotifyAdmin = 13,
  TransferGroupNotifyOldowner = 14,
  TransferGroupNotifyAdmin = 15,
}

export enum GroupNotifyStatus {
  Init = 0,
  Unhandle = 1,
  Agreed = 2,
  Refused = 3,
  Ignored = 4,
}

export interface GroupNotifyItem {
  seq: string
  notifyType: GroupNotifyType
  status: GroupNotifyStatus
  doubt: boolean
  group: { groupCode: string; groupName: string }
  user1: { uid: string; nickName: string; uin: string }
  user2: { uid: string; nickName: string; uin: string }
  postscript: string
  actionTime: string
  flag: string
}

export interface FriendRequestItem {
  friendUid: string
  friendUin: string
  friendNick: string
  reqTime: string
  extWords: string
  isDecide: boolean
  reqType: number
  addSource: string
  flag: string
}

// 被过滤的好友申请
export interface DoubtBuddyItem {
  uid: string
  nick: string
  reqTime: string
  msg: string
  source: string
  reason: string
  groupCode: string
  flag: string
}

export type NotificationItem =
  | { type: 'group-notify'; data: GroupNotifyItem; time: number }
  | { type: 'friend-request'; data: FriendRequestItem; time: number }
  | { type: 'doubt-buddy'; data: DoubtBuddyItem; time: number }
  | { type: 'group-dismiss'; data: { groupCode: string; groupName: string }; time: number }
  | { type: 'group-quit'; data: { groupCode: string; groupName: string }; time: number }

export type WebQQEvent =
  | { type: 'message-created' | 'message-sent'; data: RawMessage }
  | { type: 'emoji-reaction'; data: { groupCode: string; msgSeq: string; emojiId: string; userId: string; userName: string; isAdd: boolean } }
  | { type: 'message-deleted'; data: { msgId: string; msgSeq: string; chatType: WebChatType; peerUid: string; peerUin: string } }
  | { [K in NotificationItem['type']]: { type: K; data: Extract<NotificationItem, { type: K }>['data'] } }[NotificationItem['type']]

