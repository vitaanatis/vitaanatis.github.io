// This is the content that was previously inside the <script> tags in your HTML
const pollsContainer = document.getElementById('polls-container');
const adminPasswordInput = document.getElementById('admin-password-input');
const createSurveyButton = document.getElementById('create-survey-button');
const adminMessage = document.getElementById('admin-message');
const surveyModal = document.getElementById('survey-modal');
const closeSurveyModal = document.getElementById('close-survey-modal');
const pollQuestionInput = document.getElementById('poll-question-input');
const radioMultipleChoice = document.getElementById('radio-multiple-choice');
const radioTextMessage = document.getElementById('radio-text-message');
const multipleChoiceOptionsDiv = document.getElementById('multiple-choice-options');
const pollOptionsTextarea = document.getElementById('poll-options-textarea');
const submitNewPollButton = document.getElementById('submit-new-poll-button');
const pollCreationMessage = document.getElementById('poll-creation-message');

const ADMIN_PASSWORD = "7012";

function getOrCreateUserId() {
    let userId = localStorage.getItem('a683_voting_user_id');
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('a683_voting_user_id', userId);
    }
    return userId;
}
const currentUserId = getOrCreateUserId();

function jsonReviver(key, value) {
    if (typeof value === 'string' && /^\d+n$/.test(value)) {
        return Number(value.slice(0, -1));
    }
    return value;
}

// --- IMPORTANT: Deno Deploy URL for your backend ---
// This should be the URL where your main.ts is deployed
const DENO_DEPLOY_API_BASE_URL = 'https://vhubvote.deno.dev'; //
const wsProtocol = DENO_DEPLOY_API_BASE_URL.startsWith('https') ? 'wss://' : 'ws://';

// WebSocket connection
// The replace part is to strip 'http://' or 'https://' from the base URL for the WebSocket constructor
const ws = new WebSocket(wsProtocol + DENO_DEPLOY_API_BASE_URL.replace(/^(http|https):\/\//, ''));

ws.onopen = () => { };

ws.onmessage = (event) => {
    const data = JSON.parse(event.data, jsonReviver);
    if (data.type === "initial_polls" || data.type === "polls_update") {
        renderPolls(data.polls);
        document.querySelectorAll('.poll-modal[style*="display: flex"]').forEach(modal => {
            const pollId = modal.dataset.pollId;
            const updatedPoll = data.polls.find(p => p.id === pollId);
            if (updatedPoll) {
                renderPollDetailsInModal(updatedPoll, modal);
            }
        });
    }
};

ws.onclose = () => { };

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

function renderPolls(polls) {
    pollsContainer.innerHTML = '';
    if (polls.length === 0) {
        pollsContainer.innerHTML = '<p class="text-gray-600 text-center">No active polls. Create one using the admin panel!</p>';
        return;
    }

    polls.forEach(poll => {
        const pollButton = document.createElement('button');
        pollButton.className = 'poll-question-button';
        pollButton.textContent = poll.question;
        pollButton.onclick = () => openPollModal(poll);
        pollsContainer.appendChild(pollButton);
    });
}

function openPollModal(poll) {
    let pollModal = document.getElementById(`poll-modal-${poll.id}`);
    if (!pollModal) {
        pollModal = document.createElement('div');
        pollModal.id = `poll-modal-${poll.id}`;
        pollModal.dataset.pollId = poll.id;
        pollModal.className = 'modal poll-modal';
        // Now this HTML string is interpreted by the browser, not the Deno parser as a TS string literal
        pollModal.innerHTML = `
            <div class="modal-content">
                <span class="close-button close-poll-modal">&times;</span>
                <h2 class="section-title">${poll.question}</h2>
                <div class="poll-options" id="poll-options-${poll.id}"></div>
                <div class="poll-results mt-4" id="poll-results-${poll.id}"></div>
                <p class="voted-message" id="voted-message-${poll.id}"></p>
            </div>
        `;
        document.body.appendChild(pollModal);
        pollModal.querySelector('.close-button').onclick = () => pollModal.style.display = 'none';
    }
    renderPollDetailsInModal(poll, pollModal);
    pollModal.style.display = 'flex';
}

function renderPollDetailsInModal(poll, pollModalElement) {
    const pollOptionsDiv = pollModalElement.querySelector(`#poll-options-${poll.id}`);
    const pollResultsDiv = pollModalElement.querySelector(`#poll-results-${poll.id}`);
    const votedMessageDiv = pollModalElement.querySelector(`#voted-message-${poll.id}`);

    pollOptionsDiv.innerHTML = '';
    pollResultsDiv.innerHTML = '';
    votedMessageDiv.textContent = '';

    const hasVotedLocally = localStorage.getItem(`voted_poll_${poll.id}`) === 'true';
    if (hasVotedLocally) {
        votedMessageDiv.textContent = 'You have already voted on this poll.';
    }

    if (poll.type === "multiple_choice") {
        poll.options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'option-button';
            button.textContent = option;
            button.onclick = () => submitVote(poll.id, option, button, votedMessageDiv);
            if (hasVotedLocally) {
                button.disabled = true;
                button.classList.add('opacity-50', 'cursor-not-allowed');
            }
            pollOptionsDiv.appendChild(button);
        });
        renderMultipleChoiceResults(poll.id, poll.options, poll.results, pollResultsDiv);
    } else if (poll.type === "text_message") {
        const inputContainer = document.createElement('div');
        inputContainer.className = 'flex flex-col gap-2';
        const textarea = document.createElement('textarea');
        textarea.className = 'text-response-input';
        textarea.placeholder = 'Type your response here...';
        textarea.rows = 3;
        textarea.id = `text-response-input-${poll.id}`;
        const submitBtn = document.createElement('button');
        submitBtn.className = 'button-primary';
        submitBtn.textContent = 'Submit Response';
        submitBtn.onclick = () => submitTextResponse(poll.id, textarea, submitBtn, votedMessageDiv);
        if (hasVotedLocally) {
            textarea.disabled = true;
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            textarea.classList.add('opacity-50', 'cursor-not-allowed');
        }
        inputContainer.appendChild(textarea);
        inputContainer.appendChild(submitBtn);
        pollOptionsDiv.appendChild(inputContainer);
        renderTextMessageResults(poll.id, poll.results, pollResultsDiv);
    }
}

function renderMultipleChoiceResults(pollId, options, results, resultsDiv) {
    resultsDiv.innerHTML = '<h4 class="font-semibold text-lg text-gray-700 mb-2">Results:</h4>';
    const totalVotes = options.reduce((sum, option) => sum + (results[option] || 0), 0);
    
    options.forEach(option => {
        const count = results[option] || 0;
        const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
        const resultItem = document.createElement('div');
        resultItem.className = 'flex items-center mb-1';
        resultItem.innerHTML = `
            <span class="flex-grow">${option}:</span>
            <span class="font-bold text-blue-700">${count} votes</span>
            <span class="text-sm text-gray-600 ml-2">(${percentage}%)</span>
        `;
        resultsDiv.appendChild(resultItem);
    });
}

function renderTextMessageResults(pollId, responses, resultsDiv) {
    resultsDiv.innerHTML = '<h4 class="font-semibold text-lg text-gray-700 mb-2">Responses:</h4>';
    const responseListDiv = document.createElement('div');
    responseListDiv.className = 'text-response-list';
    if (responses.length === 0) {
        responseListDiv.innerHTML = '<p class="text-gray-500 italic">No responses yet.</p>';
    } else {
        responses.forEach(response => {
            const item = document.createElement('div');
            item.className = 'text-response-item';
            item.textContent = response;
            responseListDiv.appendChild(item);
        });
    }
    resultsDiv.appendChild(responseListDiv);
}

async function submitVote(pollId, option, button, votedMessageDiv) {
    const hasVotedLocally = localStorage.getItem(`voted_poll_${pollId}`) === 'true';
    if (hasVotedLocally) {
        votedMessageDiv.textContent = 'You have already voted on this poll.';
        return;
    }

    try {
        const response = await fetch(`${DENO_DEPLOY_API_BASE_URL}/submit-vote`, { //
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pollId, option, userId: currentUserId }),
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem(`voted_poll_${pollId}`, 'true');
            votedMessageDiv.textContent = 'Your vote has been recorded!';
            const pollOptionsDiv = document.getElementById(`poll-options-${pollId}`);
            Array.from(pollOptionsDiv.querySelectorAll('button')).forEach(btn => {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            });
        } else {
            votedMessageDiv.textContent = data.message || 'Error submitting vote.';
            votedMessageDiv.style.color = 'red';
        }
    } catch (error) {
        console.error('Error submitting vote:', error);
        votedMessageDiv.textContent = 'Network error or server issue. Please try again.';
        votedMessageDiv.style.color = 'red';
    }
}

async function submitTextResponse(pollId, textarea, button, votedMessageDiv) {
    const hasVotedLocally = localStorage.getItem(`voted_poll_${pollId}`) === 'true';
    if (hasVotedLocally) {
        votedMessageDiv.textContent = 'You have already responded to this poll.';
        return;
    }

    const responseText = textarea.value.trim();
    if (!responseText) {
        votedMessageDiv.textContent = 'Please enter a response.';
        votedMessageDiv.style.color = 'orange';
        return;
    }

    try {
        const response = await fetch(`${DENO_DEPLOY_API_BASE_URL}/submit-vote`, { //
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pollId, option: responseText, userId: currentUserId }),
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem(`voted_poll_${pollId}`, 'true');
            votedMessageDiv.textContent = 'Your response has been recorded!';
            textarea.disabled = true;
            button.disabled = true;
            textarea.classList.add('opacity-50', 'cursor-not-allowed');
            button.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            votedMessageDiv.textContent = data.message || 'Error submitting response.';
            votedMessageDiv.style.color = 'red';
        }
    } catch (error) {
        console.error('Error submitting response:', error);
        votedMessageDiv.textContent = 'Network error or server issue. Please try again.';
        votedMessageDiv.style.color = 'red';
    }
}

createSurveyButton.onclick = () => {
    if (adminPasswordInput.value === ADMIN_PASSWORD) {
        adminMessage.textContent = '';
        surveyModal.style.display = 'flex';
        pollQuestionInput.value = '';
        radioMultipleChoice.checked = true;
        pollOptionsTextarea.value = '';
        multipleChoiceOptionsDiv.style.display = 'block';
        pollCreationMessage.textContent = '';
    } else {
        adminMessage.textContent = 'Incorrect password.';
        adminMessage.style.color = 'red';
    }
};

closeSurveyModal.onclick = () => {
    surveyModal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === surveyModal || (event.target.classList.contains('poll-modal') && event.target.classList.contains('modal'))) {
        event.target.style.display = 'none';
    }
};

radioMultipleChoice.onchange = () => {
    multipleChoiceOptionsDiv.style.display = radioMultipleChoice.checked ? 'block' : 'none';
};
radioTextMessage.onchange = () => {
    multipleChoiceOptionsDiv.style.display = radioTextMessage.checked ? 'none' : 'block';
};

submitNewPollButton.onclick = async () => {
    const question = pollQuestionInput.value.trim();
    const pollType = document.querySelector('input[name="poll-type"]:checked').value;
    let options = [];

    if (!question) {
        pollCreationMessage.textContent = 'Please enter a survey question.';
        pollCreationMessage.style.color = 'red';
        return;
    }

    if (pollType === "multiple_choice") {
        options = pollOptionsTextarea.value.split('\n').map(opt => opt.trim()).filter(opt => opt !== '');
        if (options.length < 2) {
            pollCreationMessage.textContent = 'Multiple choice polls need at least two options.';
            pollCreationMessage.style.color = 'red';
            return;
        }
    }

    const newPoll = {
        question: question,
        type: pollType,
        options: options.length > 0 ? options : undefined
    };

    try {
        const response = await fetch(`${DENO_DEPLOY_API_BASE_URL}/create-poll`, { //
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: adminPasswordInput.value, poll: newPoll }),
        });

        const data = await response.json();
        if (response.ok) {
            pollCreationMessage.textContent = 'Poll created successfully!';
            pollCreationMessage.style.color = 'green';
            setTimeout(() => {
                surveyModal.style.display = 'none';
                adminPasswordInput.value = '';
            }, 1500);
        } else {
            pollCreationMessage.textContent = data.message || 'Failed to create poll.';
            pollCreationMessage.style.color = 'red';
        }
    } catch (error) {
        console.error('Error creating poll:', error);
        pollCreationMessage.textContent = 'Network error or server issue. Could not create poll.';
        pollCreationMessage.style.color = 'red';
    }
};

pollsContainer.innerHTML = '<p class="text-gray-600 text-center">Connecting and loading polls...</p>';
