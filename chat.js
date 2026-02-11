// AI Chat Functionality
class ChatBot {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        
        this.responses = {
            'hello': 'Hello! Welcome to National Prep Deaf Sports. How can I assist you today?',
            'hi': 'Hi there! What would you like to know about National Prep Deaf Sports?',
            'help': 'I can help you with information about National Prep Deaf Sports, including programs, events, and sports activities for deaf students.',
            'sports': 'We offer various sports programs including basketball, volleyball, soccer, track and field, and more for deaf and hard-of-hearing students.',
            'programs': 'National Prep Deaf Sports provides comprehensive sports programs designed specifically for deaf students to excel in athletics.',
            'contact': 'For contact information, please visit our main website or email us at info@nationalprepdeafsports.org',
            'about': 'National Prep Deaf Sports is dedicated to providing athletic opportunities for deaf and hard-of-hearing students across the nation.',
            'events': 'We host regular tournaments, training camps, and competitive events throughout the year. Check our calendar for upcoming events!',
            'join': 'To join National Prep Deaf Sports programs, please visit our registration page or contact us for more information.',
            'default': 'Thank you for your message! For specific inquiries, please contact us directly. I can help with general questions about sports, programs, events, and more.'
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }
    
    sendMessage() {
        const message = this.userInput.value.trim();
        
        if (message === '') {
            return;
        }
        
        // Display user message
        this.addMessage(message, 'user');
        
        // Clear input
        this.userInput.value = '';
        
        // Generate and display bot response
        setTimeout(() => {
            const response = this.generateResponse(message);
            this.addMessage(response, 'bot');
        }, 500);
    }
    
    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (sender === 'bot') {
            contentDiv.innerHTML = `<strong>AI Assistant:</strong> ${text}`;
        } else {
            contentDiv.innerHTML = `<strong>You:</strong> ${text}`;
        }
        
        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
    
    generateResponse(message) {
        const lowerMessage = message.toLowerCase();
        
        // Check for keyword matches
        for (const [keyword, response] of Object.entries(this.responses)) {
            if (lowerMessage.includes(keyword)) {
                return response;
            }
        }
        
        // Default response
        return this.responses.default;
    }
}

// Initialize chatbot when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});
