# data_models.py
from typing import List, Optional, Literal, Dict, Any, Union
from pydantic import BaseModel, Field, model_validator

from typing import Literal, Union

# ==========================================
# --- SUBJECT: QUANTITATIVE APTITUDE ---
# ==========================================
Quant_Topics = Literal[
    "Arithmetic", "Algebra", "Geometry & Mensuration", 
    "Number System", "Modern Math"
]

Quant_SubTopics = Literal[
    # Arithmetic
    "Percentages", "Profit, Loss & Discount", "Simple & Compound Interest",
    "Ratio, Proportion & Variation", "Averages", "Mixtures & Alligations",
    "Time & Work", "Pipes & Cisterns", "Time, Speed & Distance", "Races & Circular Tracks",
    
    # Algebra
    "Linear Equations", "Quadratic Equations", "Higher Degree Polynomials",
    "Inequalities & Modulus", "Logarithms", "Surds & Indices", 
    "Functions & Graphs", "Maxima & Minima",
    
    # Geometry & Mensuration
    "Lines & Angles", "Triangles", "Circles", "Quadrilaterals & Polygons",
    "Coordinate Geometry", "Mensuration (2D & 3D)", "Trigonometry",
    
    # Number System
    "Factors & Multiples (LCM/HCF)", "Remainders & Divisibility",
    "Base Systems", "Digits & Properties", "Successive Division",
    
    # Modern Math
    "Permutations & Combinations", "Probability", 
    "Sequence & Series (AP/GP/HP)", "Set Theory & Venn Diagrams",
    
    # Escape Hatch
    "Miscellaneous Quant"
]


# ==========================================
# --- SUBJECT: DATA INTERPRETATION & LOGICAL REASONING ---
# ==========================================
DILR_Topics = Literal[
    "Data Interpretation", "Logical Reasoning", "DI-LR Hybrid"
]

DILR_SubTopics = Literal[
    # Data Interpretation
    "Data Tables", "Bar Graphs", "Line Charts", "Pie Charts", 
    "Scatter Plots & Bubble Charts", "Radar/Spider Web Charts", 
    "Caselets (Paragraph DI)", "Missing Data DI", "Quant-Based DI",
    
    # Logical Reasoning
    "Linear Arrangement", "Circular/Polygon Arrangement",
    "Matrix & Grid Puzzles", "Selection & Conditional Grouping",
    "Blood Relations", "Direction Sense", "Syllogisms & Logic Gates", 
    "Binary Logic (Truth & Lie)", "Cubes & Dices", "Cryptarithmetic",
    "Sequential Output / Machine Input",
    
    # Advanced / Hybrid
    "Games & Tournaments", "Routes & Networks", "Scheduling & Timetables", 
    "Optimization & Max/Min", "Venn Diagrams (Multi-set)",
    
    # Escape Hatch
    "Miscellaneous DILR"
]


# ==========================================
# --- SUBJECT: VERBAL ABILITY & READING COMPREHENSION ---
# ==========================================
VARC_Topics = Literal[
    "Reading Comprehension", "Verbal Ability"
]

VARC_SubTopics = Literal[
    # Reading Comprehension (Question Types)
    "RC: Main Idea / Central Theme", "RC: Specific Detail / Fact Based",
    "RC: Inference / Implication", "RC: Tone / Attitude of Author",
    "RC: Structure / Organization", "RC: Application of Idea", 
    
    # Reading Comprehension (Genres/Passage Themes)
    "RC Genre: Philosophy & Humanities",
    "RC Genre: Psychology & Sociology",
    "RC Genre: Science & Technology",
    "RC Genre: History & Political Science",
    "RC Genre: Ecology & Environment",
    "RC Genre: Business & Economics",
    "RC Genre: Art, Literature & Culture",
    "RC Genre: Zoology & Biology",
    
    # Verbal Ability
    "Para Jumbles (TITA)", "Para Jumbles (MCQ)",
    "Odd Sentence Out", "Para Summary", "Para Completion",
    "Critical Reasoning (Assumptions/Strengthen/Weaken)",
    "Fact, Inference, Judgment (FIJ)",
    "Grammar & Sentence Correction", "Vocabulary & Word Usage",
    "Fill in the Blanks",
    
    # Escape Hatch
    "Miscellaneous RC", "Miscellaneous VA"
]

# ==========================================
# --- COMBINED MASTER TYPES ---
# ==========================================
All_Topics = Union[Quant_Topics, DILR_Topics, VARC_Topics]
All_SubTopics = Union[Quant_SubTopics, DILR_SubTopics, VARC_SubTopics]

class OriginalSource(BaseModel):
    label: str
    link: str

class ParentContext(BaseModel):
    context_id: Optional[str] = None
    context_type: Literal["passage", "caselet_text", "table", "chart"]
    context_body: str

class Options(BaseModel):
    A: str
    B: str
    C: str
    D: str

class MetadataHooks(BaseModel):
    trap_type: str = Field(description="The underlying structural pitfall (e.g., double-counting).")
    difficulty: Optional[Literal["Easy", "Medium", "Hard"]] = Field(default="Medium")
    difficulty_level: float = Field(ge=1.0, le=10.0, description="Numeric difficulty from 1.0 to 10.0.")
    calculation_intensity: Literal["Low", "Medium", "High"]
    
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
    id: str
    subject: Literal["Quant", "DILR", "VARC"]
    question_type: Optional[Literal["MCQ", "TITA"]] = Field(default="MCQ")
    topic: All_Topics
    sub_topic: All_SubTopics
    
    # Text and Structure (Copied exactly from source)
    question_text: str
    options: Optional[Options] = None
    correct_answer: Optional[str]
    solution_text: Optional[str] = None
    original_sources: List[OriginalSource] = Field(default_factory=list)
    
    # NEW: AI Image Descriptions for vector context
    image_descriptions: List[str] = Field(default_factory=list, description="Max 50-word conceptual description of the nature of the data for each image present.")
    
    # Metadata generated by AI
    metadata_hooks: MetadataHooks
    semantic_keywords: List[str] = Field(description="Extract 3-5 core mathematical/logical concepts.")
    has_parent_context: bool = Field(default=False)
    parent_context: Optional[ParentContext] = None

    @model_validator(mode='after')
    def calculate_question_type(self):
        if self.options is not None:
            self.question_type = "MCQ"
        else:
            self.question_type = "TITA"
        return self

class CATExtractionBatch(BaseModel):
    batch_type: Literal["STANDALONE", "SET"]
    parent_context: Optional[ParentContext] = None
    questions: List[CATUnifiedQuestion]


# 2. Enforce it in the LLM Payload
class LLMQuestionMetadata(BaseModel):
    subject: Literal["Quant", "DILR", "VARC"]
    
    # The LLM is now FORCED to pick exactly one of these strings. No drift is possible.
    topic: All_Topics 
    sub_topic: All_SubTopics 
    
    metadata_hooks: MetadataHooks
    
    # We leave this as an open string so the LLM can capture nuanced variations
    semantic_keywords: List[str] = Field(
        description="Extract 3-5 specific keywords from the problem (e.g., 'Trains', 'Relative Speed', 'Upstream')."
    )
    image_descriptions: List[str] = Field(
        description="For EVERY individual image/chart present in the text, provide exactly ONE conceptual description (max 50 words) of the nature of the data. If there are 2 images, return exactly 2 distinct strings in this array. Focus on structure. Leave empty if no images."
    )

class LLMBatchEnrichment(BaseModel):
    question_metadata_list: List[LLMQuestionMetadata] = Field(
        description="An array of metadata objects. MUST match the exact order and length of the provided JSON questions array."
    )

class TestGenerationRequest(BaseModel):
    subject: Optional[str] = None       
    difficulty: Optional[str] = None    
    topic: Optional[str] = None         
    sub_topic: Optional[str] = None     # Granular filtering
    limit: int = 5                      
    
    # Time configuration for the test session
    time_limit_minutes: Optional[int] = None # For full-test timers (e.g., 40 mins)
    time_per_question_seconds: Optional[int] = None # For time-boxed drill modes (e.g., 120s hard stop)

    sort_by_difficulty: bool = False # Default to exam-style shuffling