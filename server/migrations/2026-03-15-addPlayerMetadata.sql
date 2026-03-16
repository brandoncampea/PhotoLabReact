-- Migration: Add player_names and player_numbers to photos table
ALTER TABLE photos ADD player_names VARCHAR(255);
ALTER TABLE photos ADD player_numbers VARCHAR(50);
