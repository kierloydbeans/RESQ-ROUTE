from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel


class Household(SQLModel, table=True):
    __tablename__ = "household"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
            unique=True,
        )
    )
    household_name: str = Field(default="", max_length=120)


class HouseholdMember(SQLModel, table=True):
    __tablename__ = "household_member"

    id: int | None = Field(default=None, primary_key=True)
    household_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    name: str = Field(max_length=120)
    has_account: bool = Field(default=False)
