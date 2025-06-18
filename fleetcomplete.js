// Authentication flow
const credentials = {
    userName: "user@company.com",
    password: "password",
    database: "company_database"
}

// Authenticate and get session
const authResponse = await api.authenticate(credentials)
const sessionId = authResponse.credentials.sessionId

// Store session for subsequent calls
const sessionCredentials = {
    userName: "user@company.com",
    sessionId: sessionId,
    database: "company_database"
    // No password needed now!
}