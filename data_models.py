# data_models.py
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, model_validator

class ParentContext(BaseModel):
    # context_id is removed; the backend will generate this.
    context_type: Literal["passage", "caselet_text", "table", "chart"]
    context_body: str = Field(description="Raw markdown passage text, markdown tables, or data descriptions.")

class Options(BaseModel):
    A: str
    B: str
    C: str
    D: str

class MetadataHooks(BaseModel):
    trap_type: str = Field(
        description="The underlying structural pitfall (e.g., double-counting)."
    )
    # Optional so the LLM doesn't have to generate it
    difficulty: Optional[Literal["Easy", "Medium", "Hard"]] = Field(
        default="Medium", 
        description="DO NOT POPULATE. The system will auto-calculate this."
    )
    difficulty_level: float = Field(
        ge=1.0, 
        le=10.0, 
        description="Numeric difficulty from 1.0 (easiest) to 10.0 (hardest). Use up to two decimal places (e.g., 7.45, 8.2) to allow for granular sorting."
    )
    calculation_intensity: Literal["Low", "Medium", "High"]
    
    # This intercepts the object right after the LLM parses it and auto-fills the category
    @model_validator(mode='after')
    def calculate_deterministic_difficulty(self):
        if self.difficulty_level < 4.0:
            self.difficulty = "Easy"
        elif self.difficulty_level >= 7.0:
            self.difficulty = "Hard"
        else:
            self.difficulty = "Medium"
        return self

class CATUnifiedQuestion(BaseModel):
    # id is removed; the backend will generate this.
    subject: Literal["Quant", "DILR", "VARC"]
    question_type: Optional[Literal["MCQ", "TITA"]] = Field(default="MCQ", 
                                                  description="TITA = 'Type In The Answer' (no options, direct answer input). " \
                                                  "If TITA, options MUST be null.")
    topic: str
    sub_topic: str
    has_parent_context: bool
    parent_context: Optional[ParentContext] = None
    question_text: str = Field(description="Core prompt string. Use standard KaTeX formulas where relevant.")
    options: Optional[Options] = Field(default=None, description="Must be null if question_type is TITA.")
    correct_answer: Optional[str] = Field(description="Option key (A, B, C, D) for MCQ, or explicit value for TITA.")
    
    # Updated: Forbid generation to save tokens
    solution_text: Optional[str] = Field(default=None, description="Extract ONLY if present in source. DO NOT generate or calculate a solution.")
    
    metadata_hooks: MetadataHooks
    
    # Added: For enhanced semantic vector search mapping
    semantic_keywords: List[str] = Field(description="Extract 3-5 core mathematical/logical concepts tested here (e.g., 'discriminant', 'circular arrangement').")

    # This intercepts the object right after the LLM parses it and auto-fills the category
    @model_validator(mode='after')
    def calculate_question_type(self):
        if self.options is not None:
            self.question_type = "MCQ"
        else:
            self.question_type = "TITA"
        return self

class CATExtractionBatch(BaseModel):
    questions: List[CATUnifiedQuestion]