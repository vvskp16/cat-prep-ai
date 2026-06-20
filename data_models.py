# data_models.py
from typing import List, Optional, Literal
from pydantic import BaseModel, Field

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
    trap_type: str = Field(description="The underlying structural pitfall (e.g., double-counting).")
    difficulty: Literal["Easy", "Medium", "Hard"]
    calculation_intensity: Literal["Low", "Medium", "High"]

class CATUnifiedQuestion(BaseModel):
    # id is removed; the backend will generate this.
    subject: Literal["Quant", "DILR", "VARC"]
    question_type: Literal["MCQ", "TITA"]
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

class CATExtractionBatch(BaseModel):
    questions: List[CATUnifiedQuestion]