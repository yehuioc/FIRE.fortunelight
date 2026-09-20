"""Validated public data contracts. Invalid backups never partially restore."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from .model import cents, iso_date, CATEGORIES, NATURES, MODULES


class SettingsIn(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    birth_date: str
    target_age: int = Field(80, ge=1, le=150)
    mode: Literal["quick", "advanced"] = "quick"
    expense_mode: Literal["manual", "ledger"] = "manual"
    manual_daily_expense: Decimal = Decimal("100")
    show_past: bool = False
    use_initial_assets: bool = False
    initial_assets: Decimal = Decimal("0")
    tracking_days_override: int = Field(0, ge=0, le=365000)
    theme: Literal["midnight", "paper"] = "midnight"
    font_family: Literal["system", "serif"] = "system"
    font_scale: int = 100
    home_module_order: list[str] = Field(default_factory=lambda: MODULES.copy())
    sound_enabled: bool = False
    ritual_enabled: bool = True
    inline_tips_enabled: bool = True
    freedom_delta_hint: bool = True
    habit_center: bool = True
    achievements_enabled: bool = True
    quick_entry_enabled: bool = True
    missed_prompt_enabled: bool = True
    weekly_review_enabled: bool = True
    opening_balance: Decimal | None = None
    advanced_dormant: dict = Field(default_factory=dict)

    @field_validator("birth_date")
    @classmethod
    def valid_birth(cls, value):
        when = iso_date(value)
        if when < date(1900, 1, 1):
            raise ValueError("出生日期不得早于 1900-01-01")
        return value

    @field_validator("manual_daily_expense", "initial_assets", "opening_balance", mode="before")
    @classmethod
    def valid_money(cls, value):
        if value is not None:
            cents(value)
        return value

    @field_validator("font_scale", mode="before")
    @classmethod
    def valid_scale(cls, value):
        value = {"compact": 90, "standard": 100, "large": 110}.get(str(value), value)
        if int(value) not in range(85, 116, 5):
            raise ValueError("字号须为 85%–115%，步长 5%")
        return int(value)

    @field_validator("home_module_order")
    @classmethod
    def clean_order(cls, value):
        order = list(dict.fromkeys(x for x in value if x in MODULES))
        return order + [x for x in MODULES if x not in order]

    @model_validator(mode="after")
    def valid_cost(self):
        if (self.mode == "quick" or self.expense_mode == "manual") and self.manual_daily_expense <= 0:
            raise ValueError("手动生活成本必须至少为 ¥0.01")
        return self


class TransactionIn(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    occurred_on: str = Field(default_factory=lambda: date.today().isoformat())
    type: Literal["income", "expense"]
    amount: Decimal
    note: str = Field("", max_length=500)
    category_id: str = "uncategorized"
    detail_tag: str = Field("", max_length=40)
    nature: str = "unset"
    entry_key: str | None = Field(None, min_length=1, max_length=100)

    @field_validator("occurred_on")
    @classmethod
    def valid_date(cls, value):
        iso_date(value)
        return value

    @field_validator("amount", mode="before")
    @classmethod
    def valid_amount(cls, value):
        if cents(value) < 1:
            raise ValueError("金额至少为 ¥0.01，最多两位小数")
        return value

    @field_validator("category_id")
    @classmethod
    def valid_category(cls, value):
        if value not in CATEGORIES:
            raise ValueError("未知主分类")
        return value

    @field_validator("nature")
    @classmethod
    def valid_nature(cls, value):
        if value not in NATURES:
            raise ValueError("未知消费性质")
        return value

    @model_validator(mode="after")
    def income_metadata(self):
        if self.type == "income":
            self.category_id, self.detail_tag, self.nature = "uncategorized", "", "unset"
        return self


class PresetIn(BaseModel):
    category_id: str
    label: str = Field(min_length=1, max_length=40)
    note: str = Field("", max_length=500)
    nature: str = "unset"

    @field_validator("label")
    @classmethod
    def trim_label(cls, value):
        if not value.strip():
            raise ValueError("标签名称不能为空")
        return value.strip()

    @model_validator(mode="after")
    def valid_tags(self):
        if self.category_id not in CATEGORIES or self.nature not in NATURES:
            raise ValueError("未知主分类或消费性质")
        return self
