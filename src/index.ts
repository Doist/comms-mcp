import { getMcpServer } from './mcp-server.js'
import { buildLink } from './tools/build-link.js'
import { createThread } from './tools/create-thread.js'
import { deleteObject } from './tools/delete-object.js'
import { fetchInbox } from './tools/fetch-inbox.js'
import { getGroups } from './tools/get-groups.js'
import { getMentions } from './tools/get-mentions.js'
import { listChannels } from './tools/list-channels.js'
import { loadConversation } from './tools/load-conversation.js'
import { loadThread } from './tools/load-thread.js'
import { markDone } from './tools/mark-done.js'
import { react } from './tools/react.js'
import { reply } from './tools/reply.js'
import { searchContent } from './tools/search-content.js'
import { updateObject } from './tools/update-object.js'
import { userInfo } from './tools/user-info.js'
import { validateCommsToken } from './utils/validate-comms-token.js'

const tools = {
    userInfo,
    fetchInbox,
    loadThread,
    loadConversation,
    searchContent,
    getMentions,
    createThread,
    updateObject,
    deleteObject,
    reply,
    react,
    markDone,
    buildLink,
    listChannels,
    getGroups,
}

export { tools, getMcpServer, validateCommsToken }
export type { CommsTokenValidationResult } from './utils/validate-comms-token.js'
// Re-exported so consumers can catch the documented throw type of
// validateCommsToken without taking a direct @doist/comms-sdk dependency.
export { CommsRequestError } from '@doist/comms-sdk'

export {
    userInfo,
    fetchInbox,
    loadThread,
    loadConversation,
    searchContent,
    getMentions,
    createThread,
    updateObject,
    deleteObject,
    reply,
    react,
    markDone,
    buildLink,
    listChannels,
    getGroups,
}
