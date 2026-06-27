//! AI provider abstraction. OpenAI is the only impl in this phase; adding a
//! second provider should be a self-contained file under this module.
pub mod openai;
pub mod prompts;
