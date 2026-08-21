-- Migration 003: Add dispatcher access to the user role enum

ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'DISPATCHER';