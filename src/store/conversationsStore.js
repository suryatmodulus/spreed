/**
 * @copyright Copyright (c) 2019 Marco Ambrosini <marcoambrosini@pm.me>
 *
 * @author Marco Ambrosini <marcoambrosini@pm.me>
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 */
import Vue from 'vue'
import {
	makePublic,
	makePrivate,
	setSIPEnabled,
	changeLobbyState,
	changeReadOnlyState,
	changeListable,
	addToFavorites,
	removeFromFavorites,
	setConversationName,
	setConversationDescription } from '../services/conversationsService'
import { getCurrentUser } from '@nextcloud/auth'
import { CONVERSATION, WEBINAR, PARTICIPANT } from '../constants'

const DUMMY_CONVERSATION = {
	token: '',
	displayName: '',
	isFavorite: false,
	hasPassword: false,
	canEnableSIP: false,
	type: CONVERSATION.TYPE.PUBLIC,
	participantFlags: PARTICIPANT.CALL_FLAG.DISCONNECTED,
	participantType: PARTICIPANT.TYPE.USER,
	readOnly: CONVERSATION.STATE.READ_ONLY,
	listable: CONVERSATION.LISTABLE.NONE,
	hasCall: false,
	canStartCall: false,
	lobbyState: WEBINAR.LOBBY.NONE,
	lobbyTimer: 0,
	attendeePin: '',
}

const getDefaultState = () => {
	return {
		conversations: {
		},
	}
}

const state = {
	conversations: {
	},
}

const getters = {
	conversations: state => state.conversations,
	conversationsList: state => Object.values(state.conversations),
	/**
	 * Get a conversation providing it's token
	 * @param {object} state state object
	 * @returns {function} The callback function
	 * @returns {object} The conversation object
	 */
	conversation: state => token => state.conversations[token],
	dummyConversation: state => Object.assign({}, DUMMY_CONVERSATION),
}

const mutations = {
	/**
	 * Adds a conversation to the store.
	 *
	 * @param {object} state current store state;
	 * @param {object} conversation the conversation;
	 */
	addConversation(state, conversation) {
		Vue.set(state.conversations, conversation.token, conversation)
	},
	/**
	 * Deletes a conversation from the store.
	 * @param {object} state current store state;
	 * @param {object} token the token of the conversation to delete;
	 */
	deleteConversation(state, token) {
		Vue.delete(state.conversations, token)
	},
	/**
	 * Resets the store to it's original state
	 * @param {object} state current store state;
	 */
	purgeConversationsStore(state) {
		Object.assign(state, getDefaultState())
	},

	setConversationDescription(state, { token, description }) {
		Vue.set(state.conversations[token], 'description', description)
	},

	updateConversationLastReadMessage(state, { token, lastReadMessage }) {
		Vue.set(state.conversations[token], 'lastReadMessage', lastReadMessage)
	},

	updateConversationLastMessage(state, { token, lastMessage }) {
		Vue.set(state.conversations[token], 'lastMessage', lastMessage)
	},
}

const actions = {
	/**
	 * Add a conversation to the store and index the displayname.
	 *
	 * @param {object} context default store context;
	 * @param {object} conversation the conversation;
	 */
	addConversation(context, conversation) {
		context.commit('addConversation', conversation)

		let currentUser = {
			uid: context.getters.getUserId(),
			displayName: context.getters.getDisplayName(),
		}

		// Fallback to getCurrentUser() only if if has not been set yet (as
		// getCurrentUser() needs to be overriden in public share pages as it
		// always returns an anonymous user).
		if (!currentUser.uid) {
			currentUser = getCurrentUser()
		}
		context.dispatch('addParticipantOnce', {
			token: conversation.token,
			participant: {
				inCall: conversation.participantFlags,
				lastPing: conversation.lastPing,
				sessionId: conversation.sessionId,
				participantType: conversation.participantType,
				attendeeId: conversation.attendeeId,
				actorType: conversation.actorType,
				actorId: conversation.actorId, // FIXME check public share page handling
				userId: currentUser ? currentUser.uid : '',
				displayName: currentUser && currentUser.displayName ? currentUser.displayName : '', // TODO guest name from localstore?
			},
		})
	},

	/**
	 * Delete a conversation from the store.
	 *
	 * @param {object} context default store context;
	 * @param {object} token the token of the conversation to be deleted;
	 */
	deleteConversation(context, token) {
		context.dispatch('deleteMessages', token)
		context.commit('deleteConversation', token)
	},

	/**
	 * Resets the store to it's original state.
	 * @param {object} context default store context;
	 */
	purgeConversationsStore(context) {
		context.commit('purgeConversationsStore')
	},

	async toggleGuests({ commit, getters }, { token, allowGuests }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		if (allowGuests) {
			await makePublic(token)
			conversation.type = CONVERSATION.TYPE.PUBLIC
		} else {
			await makePrivate(token)
			conversation.type = CONVERSATION.TYPE.GROUP
		}

		commit('addConversation', conversation)
	},

	async toggleFavorite({ commit, getters }, { token, isFavorite }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		if (isFavorite) {
			await removeFromFavorites(token)
		} else {
			await addToFavorites(token)
		}
		conversation.isFavorite = !isFavorite

		commit('addConversation', conversation)
	},

	async toggleLobby({ commit, getters }, { token, enableLobby }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		if (enableLobby) {
			await changeLobbyState(token, WEBINAR.LOBBY.NON_MODERATORS)
			conversation.lobbyState = WEBINAR.LOBBY.NON_MODERATORS
		} else {
			await changeLobbyState(token, WEBINAR.LOBBY.NONE)
			conversation.lobbyState = WEBINAR.LOBBY.NONE
		}

		commit('addConversation', conversation)
	},

	async setConversationName({ commit, getters }, { token, name }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		await setConversationName(token, name)
		conversation.displayName = name

		commit('addConversation', conversation)
	},

	async setConversationDescription({ commit }, { token, description }) {
		await setConversationDescription(token, description)
		commit('setConversationDescription', { token, description })
	},

	async setReadOnlyState({ commit, getters }, { token, readOnly }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		await changeReadOnlyState(token, readOnly)
		conversation.readOnly = readOnly

		commit('addConversation', conversation)
	},

	async setListable({ commit, getters }, { token, listable }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		await changeListable(token, listable)
		conversation.listable = listable

		commit('addConversation', conversation)
	},

	async setLobbyTimer({ commit, getters }, { token, timestamp }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		// The backend requires the state and timestamp to be set together.
		await changeLobbyState(token, conversation.lobbyState, timestamp)
		conversation.lobbyTimer = timestamp

		commit('addConversation', conversation)
	},

	async setSIPEnabled({ commit, getters }, { token, state }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		// The backend requires the state and timestamp to be set together.
		await setSIPEnabled(token, state)
		conversation.sipEnabled = state

		commit('addConversation', conversation)
	},

	async markConversationRead({ commit, getters }, token) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		conversation.unreadMessages = 0
		conversation.unreadMention = false

		commit('addConversation', conversation)
	},

	async updateLastCommonReadMessage({ commit, getters }, { token, lastCommonReadMessage }) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		conversation.lastCommonReadMessage = lastCommonReadMessage

		commit('addConversation', conversation)
	},

	async updateConversationLastActive({ commit, getters }, token) {
		const conversation = Object.assign({}, getters.conversations[token])
		if (!conversation) {
			return
		}

		conversation.lastActivity = (new Date().getTime()) / 1000

		commit('addConversation', conversation)
	},

	async updateConversationLastMessage({ commit }, { token, lastMessage }) {
		commit('updateConversationLastMessage', { token, lastMessage })
	},

	async updateConversationLastReadMessage({ commit }, { token, lastReadMessage }) {
		commit('updateConversationLastReadMessage', { token, lastReadMessage })
	},
}

export default { state, mutations, getters, actions }
