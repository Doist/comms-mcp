import type { CommsApi, Thread } from '@doist/comms-sdk'

/**
 * Returns the objIndex of the last comment in a thread, which is the read
 * position that clears its unread marker.
 *
 * Comment objIndexes start at 0 for the thread post, so the last one is
 * `commentCount - 1`. `lastObjIndex` carries that value directly; the
 * count-based fallback covers records where the API omits it.
 */
function getThreadLastObjIndex(thread: Pick<Thread, 'lastObjIndex' | 'commentCount'>): number {
    return thread.lastObjIndex ?? Math.max(thread.commentCount - 1, 0)
}

/**
 * Marks a thread as read through its latest comment.
 *
 * `threads.markRead` takes the objIndex the caller has read up to; the unread
 * marker moves to the comment after it. Passing 0 only covers the thread post,
 * so any thread with comments stays unread and keeps its badge. The read
 * position is resolved from the thread record rather than guessed: overshooting
 * (e.g. `commentCount`) also clears the badge, but pushes the marker past the
 * next comment so it would arrive already read.
 */
export async function markThreadFullyRead(client: CommsApi, id: string): Promise<void> {
    const thread = await client.threads.getThread(id)
    await client.threads.markRead({ id, objIndex: getThreadLastObjIndex(thread) })
}

/**
 * Marks a conversation as read through its latest message.
 *
 * The API rejects `conversations.markRead` without a position (`Either
 * obj_index or message_id should be provided`), and `objIndex: 0` only covers
 * the first message, so the conversation record is fetched for its
 * `lastObjIndex`.
 */
export async function markConversationFullyRead(client: CommsApi, id: string): Promise<void> {
    const conversation = await client.conversations.getConversation(id)
    await client.conversations.markRead({ id, objIndex: conversation.lastObjIndex })
}
