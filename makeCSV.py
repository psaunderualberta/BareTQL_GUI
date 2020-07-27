import sqlite3
import html
import ftfy
import csv
import os

def main():
  # Get path to current file
  # http://stackoverflow.com/questions/5137497/ddg#5137509
  # Accessed July 27th, 2020
  filepath = os.path.dirname(os.path.realpath(__file__))
  outputFolder = './csv'

  db_name = find('database.db', filepath)


  try:
      conn = sqlite3.connect(db_name)
  except FileNotFoundError:
      print("Error: No file named 'database.db' in current directory. Exiting.")
      exit()
  
  c = conn.cursor()

  for table in c.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall():
    table = table[0]
    with open(os.path.join(outputFolder, f'{table}.csv'), 'w', encoding='UTF-8', newline='') as outputFile:
      # Writing SQLite database to csv file
      # https://stackoverflow.com/questions/3710263/how-do-i-create-a-csv-file-from-database-in-python
      # Accessed July 27th, 2020

      c.execute(f'SELECT * FROM {table}')
      print(f"Writing table {table} to csv file.")
      csv_writer = csv.writer(outputFile)
      csv_writer.writerow([i[0] for i in c.description]) # write headers
      csv_writer.writerows(c)
      print(f"Finished writing table '{table}'' to csv file.")

def find(name, path):
  # Find a file in python 
  # https://stackoverflow.com/questions/1724693/find-a-file-in-python
  # Accessed July 27, 2020
  for root, _, files in os.walk(path):
    if name in files:
      return os.path.join(root, name)

if __name__ == "__main__":
  main()