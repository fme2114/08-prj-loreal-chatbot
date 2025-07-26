/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Store conversation history and user context
let messages = [];
let userContext = {
  name: null,
  skinType: null,
  concerns: [],
  preferences: [],
  previousProducts: [],
  conversationStartTime: new Date(),
};

// Cloudflare worker URL - handles API requests securely
const workerURL = "https://wanderbot-worker.fme2114.workers.dev/";

// Set initial message
chatWindow.innerHTML =
  "<div class=\"msg ai\">👋 Hello! I'm your L'Oréal Smart Product Advisor. How can I help you today?</div>";

/* Extract and update user context from conversation */
function updateUserContext(userMessage, aiResponse) {
  const lowerMessage = userMessage.toLowerCase();

  // Extract user's name if mentioned
  const namePatterns = [
    /my name is (\w+)/i,
    /i'm (\w+)/i,
    /i am (\w+)/i,
    /call me (\w+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      userContext.name = match[1];
      console.log("User name detected:", userContext.name);
      break;
    }
  }

  // Extract skin type mentions
  const skinTypes = [
    "dry",
    "oily",
    "combination",
    "sensitive",
    "normal",
    "mature",
  ];
  for (const type of skinTypes) {
    if (
      lowerMessage.includes(type + " skin") ||
      lowerMessage.includes("skin is " + type)
    ) {
      if (!userContext.skinType || userContext.skinType !== type) {
        userContext.skinType = type;
        console.log("Skin type detected:", userContext.skinType);
      }
    }
  }

  // Extract skin concerns
  const concerns = [
    "acne",
    "wrinkles",
    "aging",
    "dark spots",
    "dryness",
    "oiliness",
    "pores",
    "redness",
    "sensitivity",
  ];
  for (const concern of concerns) {
    if (
      lowerMessage.includes(concern) &&
      !userContext.concerns.includes(concern)
    ) {
      userContext.concerns.push(concern);
      console.log("New concern detected:", concern);
    }
  }

  // Extract product mentions from AI response to track recommendations
  const productKeywords = [
    "moisturizer",
    "cleanser",
    "serum",
    "foundation",
    "mascara",
    "lipstick",
    "sunscreen",
  ];
  for (const product of productKeywords) {
    if (
      aiResponse.toLowerCase().includes(product) &&
      !userContext.previousProducts.includes(product)
    ) {
      userContext.previousProducts.push(product);
    }
  }
}

/* Build enhanced system message with user context */
function buildSystemMessage() {
  let contextInfo = "";

  if (userContext.name) {
    contextInfo += `The user's name is ${userContext.name}. `;
  }

  if (userContext.skinType) {
    contextInfo += `They have ${userContext.skinType} skin. `;
  }

  if (userContext.concerns.length > 0) {
    contextInfo += `Their skin concerns include: ${userContext.concerns.join(
      ", "
    )}. `;
  }

  if (userContext.previousProducts.length > 0) {
    contextInfo += `You've previously discussed these product types: ${userContext.previousProducts.join(
      ", "
    )}. `;
  }

  const baseSystemMessage =
    "You are a helpful L'Oréal beauty advisor. Your role is specifically to help customers with L'Oréal products, skincare routines, makeup tips, beauty advice, and cosmetic recommendations. You should be friendly, knowledgeable, and professional. Keep responses concise but helpful. IMPORTANT: If users ask about topics unrelated to beauty, cosmetics, skincare, makeup, or L'Oréal products (such as general knowledge, politics, technology, sports, etc.), politely redirect them back to beauty-related topics. For example, you can say 'I'm here to help you with L'Oréal products and beauty advice. Is there anything about skincare, makeup, or our product range I can assist you with today?'";

  return {
    role: "system",
    content:
      baseSystemMessage +
      (contextInfo
        ? ` CONTEXT: ${contextInfo}Use this context to provide personalized recommendations and reference previous parts of the conversation naturally.`
        : ""),
  };
}
/* Add message to chat window */
function addMessage(content, isUser = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = isUser ? "msg user" : "msg ai";

  // Use innerHTML for AI messages to allow formatting, textContent for user messages for security
  if (isUser) {
    messageDiv.textContent = content;
  } else {
    messageDiv.innerHTML = content;
  }

  chatWindow.appendChild(messageDiv);

  // Scroll to bottom smoothly
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Reset conversation context (useful for new customers) */
function resetConversation() {
  messages = [];
  userContext = {
    name: null,
    skinType: null,
    concerns: [],
    preferences: [],
    previousProducts: [],
    conversationStartTime: new Date(),
  };
  chatWindow.innerHTML =
    "<div class=\"msg ai\">👋 Hello! I'm your L'Oréal Smart Product Advisor. How can I help you today?</div>";
  console.log("Conversation reset");
}

/* Debug function to view current user context */
function viewUserContext() {
  console.log("Current user context:", userContext);
  console.log("Conversation length:", messages.length, "messages");
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Capture user input from the chat interface
  const userMessage = userInput.value.trim();
  if (!userMessage) return;

  // Disable form while processing to prevent multiple submissions
  userInput.disabled = true;
  const sendButton = document.getElementById("sendBtn");
  sendButton.disabled = true;

  // Display user message in the chat interface
  addMessage(userMessage, true);

  // Add user message to conversation history for context
  messages.push({ role: "user", content: userMessage });

  // Clear input field
  userInput.value = "";

  // Build enhanced system message with user context
  const systemMessage = buildSystemMessage();

  try {
    // Show typing indicator to give user feedback
    const typingDiv = document.createElement("div");
    typingDiv.className = "msg ai typing-indicator";
    typingDiv.textContent = "Typing...";
    chatWindow.appendChild(typingDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    // Send request to Cloudflare Worker (which will forward to OpenAI API)
    const response = await fetch(workerURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [systemMessage, ...messages], // Send conversation history to worker
      }),
    });

    // Remove typing indicator
    chatWindow.removeChild(typingDiv);

    // Check if the API request was successful
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `API Error: ${response.status} - ${
          errorData.error?.message || "Unknown error"
        }`
      );
    }

    // Parse the response from OpenAI
    const data = await response.json();

    // Debug logging to help identify issues
    console.log("Full API response:", data);

    // Check if response has the expected structure
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Invalid response structure from API");
    }

    const aiResponse = data.choices[0].message.content;

    // Update user context based on the conversation
    updateUserContext(userMessage, aiResponse);

    // Check if response was cut off due to token limit
    if (data.choices[0].finish_reason === "length") {
      console.warn("Response was truncated due to token limit");
      // Optionally add a note to the user
      const truncatedResponse =
        aiResponse +
        "\n\n[Response was truncated. Please ask me to continue if you need more information.]";
      addMessage(truncatedResponse, false);
    } else {
      addMessage(aiResponse, false);
    }

    // Add AI response to conversation history for context in future messages
    messages.push({ role: "assistant", content: aiResponse });
  } catch (error) {
    // Remove typing indicator if it exists
    const typingIndicator = chatWindow.querySelector(".typing-indicator");
    if (typingIndicator) {
      chatWindow.removeChild(typingIndicator);
    }

    // Display clear error message to user
    let errorMessage =
      "Sorry, I'm having trouble connecting right now. Please try again in a moment.";

    // Provide more specific error messages for common issues
    if (error.message.includes("401")) {
      errorMessage =
        "There's an issue with the API key. Please check your configuration.";
    } else if (error.message.includes("429")) {
      errorMessage =
        "Too many requests. Please wait a moment before trying again.";
    } else if (
      error.message.includes("network") ||
      error.name === "TypeError"
    ) {
      errorMessage =
        "Network connection issue. Please check your internet connection.";
    }

    addMessage(errorMessage, false);
    console.error("Detailed error:", error);
  } finally {
    // Re-enable form controls
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus(); // Return focus to input for better user experience
  }
});
