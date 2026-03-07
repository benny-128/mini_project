
CREATE DATABASE IF NOT EXISTS library_db;
USE library_db;

CREATE TABLE users (
id INT AUTO_INCREMENT PRIMARY KEY,
name VARCHAR(100),
role ENUM('student','teacher','admin'),
login_id VARCHAR(50),
password VARCHAR(100)
);

CREATE TABLE books (
id INT AUTO_INCREMENT PRIMARY KEY,
title VARCHAR(200),
author VARCHAR(200),
available_quantity INT DEFAULT 1
);

CREATE TABLE book_requests (
id INT AUTO_INCREMENT PRIMARY KEY,
user_id INT,
book_id INT,
status ENUM('pending','approved','rejected') DEFAULT 'pending'
);

CREATE TABLE issued_books (
id INT AUTO_INCREMENT PRIMARY KEY,
user_id INT,
book_id INT,
issue_date DATE,
due_date DATE,
return_date DATE,
status ENUM('issued','returned') DEFAULT 'issued'
);

CREATE TABLE return_tickets (
id INT AUTO_INCREMENT PRIMARY KEY,
issue_id INT,
status ENUM('pending','accepted') DEFAULT 'pending'
);
