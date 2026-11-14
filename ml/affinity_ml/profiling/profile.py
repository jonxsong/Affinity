from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field


class Interest(BaseModel):
    topic: str = Field(min_length=1, max_length=100)
    weight: float = Field(ge=0, le=1)
    evidence: list[str] = Field(default_factory=list)


class SemanticProfile(BaseModel):
    interests: list[Interest]
    recent_intent: list[str]
    profile_version: int = 1
    observed_behavior: list[str]
    inferred_hypotheses: list[str]
    sensitive_attributes_inferred: bool = False


class ProfileProvider(Protocol):
    def create_profile(self, behavior_summary: str) -> SemanticProfile: ...


class DisabledProvider:
    """Safe default when no optional LLM provider is configured."""

    def create_profile(self, behavior_summary: str) -> SemanticProfile:
        return SemanticProfile(interests=[], recent_intent=[], observed_behavior=[behavior_summary], inferred_hypotheses=[])

