import pandas as pd
import numpy as np
from baretql.program import UnitTagging
from baretql.parsingScripts import tablesScript
import string
import re
import os
import itertools
import operator


class Converter():
    """ 
    An instance of this class represents a Converter used to convert
    from json to txt. All of the class methods are centred around converting 
    dictionaries of data to a format useable by BareTQL. In order to
    do that, we use pandas dataframe for easy manipulation of the data.
    """
    null = ["NULL", "-", "nan"]
    punctuation = string.punctuation + '- -'

    def __init__(self, data=None, filepath=None):
        self.df, self.isMultiIndex = self.makeTable(data, filepath)
        if data is not None:
            self.nestedHeaders = data['nestedHeaders']
            self.captions = data['caption']
            self.title = data['title']
        else:
            self.nestedHeaders = [0]
            self.captions = []
            self.title = f' { os.path.split(os.path.splitext(filepath)[0])[-1] }'
        self.noHeaders = None
        self.sep = '"'

    def makeTable(self, data, filepath):
        """
        Converts the data dictionary into a pandas dataframe.

        Arguments:
        - data: The data dictionary that was passed with __init__
        - filepath: The filepath to the sheet (csv or xlsx) that contains the data.

        Returns:
        - dataframe of read-in data, whether or not it is a multi-frame (hardcoded to False)
        """
        if filepath is None:
            df = pd.DataFrame.from_dict(data['rows'])
        elif os.path.splitext(filepath)[1] == '.xlsx':
            df = pd.read_excel(filepath, header=None)
        elif os.path.splitext(filepath)[1] == '.csv':
            df = pd.read_csv(filepath, header=None)

        df = df.applymap(lambda x: str(x))
        df = df.replace(to_replace=self.null, value="")
        return df, False

    def validateColumns(self):
        """
        Iterates over all columns of the table, 
        deleting those that are not valid. 
        A valid column satisfies the following properties:
        1. Does not contain NULL in every cell
        2. Has at least 1 row and average cell length is < 40
        3. Does not have the same value in every cell
        4. Is not entirely punctuation
        5. Is not a column reserved entirely for files (pictures, etc.)

        Returns:
        Number of columns in the table.
        """
        removed = 0
        withHeaders = self.df.copy()
        self.df.drop(self.nestedHeaders, inplace=True)
        if not self.isMultiIndex:
            for column in self.df.columns:
                col = self.df[column]
                if any([
                    self.isEmpty(col),
                    self.isAppropSize(col),
                    self.isPuncCol(col),
                    self.isImageCol(col),
                ]):
                    withHeaders.drop(column, axis=1, inplace=True)
                    removed += 1
        self.df = withHeaders
        return removed

    def isEmpty(self, col):
        """
        Determines whether a column is entirely null values

        Arguments:
        - col: The column to be analyzed

        Returns:
        True if col is empty, False otherwise
        """
        if len(col) == 0:
            return True
        threshold = 0.8
        percent = sum(cell == "" for cell in col) / len(col)
        return threshold < percent

    def isAppropSize(self, col):
        """
        Determines whether a column is of appropriate size

        Arguments:
        - col: The column to be analyzed

        Returns:
        True if col is empty, False otherwise
        """
        l = len(col)

        totalSize = sum(len(str(cell)) for cell in col)
        return l > 0 and (totalSize / l) > 100

    def isPuncCol(self, col):
        """
        Determines whether a column is constructed only
        using puncuation.

        Arguments:
        - col: The column to be analyzed

        Returns:
        True if col is empty, False otherwise
        """
        for cell in col:
            if re.sub(r"^[^\w\d]*$", "", cell) != "":
                return False 

        return True

    def isImageCol(self, col):
        """
        Determines if a column's values are entirely links to images.

        Arguments:
        - col: The column to be tested

        Returns:
        True if every value in col is an image file, False otherwise.
        """
        img = re.compile(r"^((?:File|Image):.*?\.[^\|\]]*).*?$")
        return any(img.match(cell) is not None for cell in col)

    def setKey(self):
        """
        Iterates through all columns of the table trying to find a valid key column.
        A key column satisfies the following requirements:
        1. Is textual in content (not numeric, date, or other)
        2. All entries are unique
        3. Not simply the row index of the row
        4. At least 3 rows that do not have any punctuation, excluding ',.-'
        5. At least 3 rows that are not a combination of numbers and punctuation

        Returns:
        - True if found a suitable key column, False if 
        no such column exists

        """
        for columnName in self.df.columns:
            column = self.df[columnName]
            cType = UnitTagging.tag_unit_for_column(column)

            if not any([
                cType != 'text',  # Not textual
                "" in column, # >= 1 cell that is empty
                len(set(column)) < len(column) * 0.5, # Not unique (for our purposes)
                tablesScript.is_increment(list(column)),  # Incremental
                not self.minPunctCol(column), # Contains < minimum # allowed punctuation
                not self.minPunctIntCol(column), # Contains < minimum # allows punc & numbers
            ]):

                newNestedHeaders = self.df[columnName][self.nestedHeaders]
                self.df.set_index(columnName, drop=True, inplace=True)
                self.noHeaders = self.df.drop(newNestedHeaders, axis='index').copy()
                break
        else:
            # No break occurred, which implies no valid key column exists
            return False
        return len(self.df) >= 3

    def minPunctCol(self, col):
        """
        Determines if a column contains the minimum number of cells
        which are not entirely composed of punctuation
        """
        punct = self.punctuation.replace(
            "-", '').replace(",", '').replace(".", '').replace(" ", '')
        validCells = sum(re.search("[{0}]".format(
            punct), cell) is None for cell in col)
        return validCells >= 3

    def minPunctIntCol(self, col):
        """
        Determines if a column contains the minimum number of cells
        which are not entirely punctuation and numbers.

        Arguments:
        - col: The column to be tested

        Returns:
        True if column satisfies the requirement above, False otherwise.
        """
        punct = self.punctuation.replace("-", '')
        validCells = sum(
            re.sub(r"[{0}\-{1}]".format(punct, r"\d"), "", cell) != "" for cell in col)
        return validCells >= 3

    def write(self, file):
        """
        Writes self.df to the output file after correctly formatting.

        Arguments:
        - file: The file object which we are writing to.

        Returns:
        - None
        """
        for col in self.noHeaders:
            self.noHeaders[col] = pd.to_numeric(self.noHeaders[col], errors='ignore')
        types = ['object'] + list(map(str, self.noHeaders.dtypes.values))

        file.write("title: {0}\n".format(self.title))
        file.write("types: {0}\n".format(', '.join(types)))
        
        for header in self.nestedHeaders:
            file.write("header: {0}\n".format(header))

        for cap in self.captions:
            file.write("caption: {0}\n".format(cap))

        for idx, row in self.df.iterrows():
            file.write(f'{self.sep}{idx}{self.sep}')
            for cell in row:
                file.write(f', {self.sep}{cell}{self.sep}')
            file.write('\n')


        file.write('\n\n')
        

        return

    def getDimensions(self):
        """
        Returns the dimensions of the table
        """
        return len(self.df), len(self.df.columns)

    # def validateRows(self):
    #     """
    #     Iterates over all rows of the table and 
    #     deletes those that are not valid, provided the 
    #     table has > 1 column.
    #     A valid row satisfies all of the following properties:
    #     1. At least 2 distinct values across all cells

    #     Returns:
    #     Number of rows in the table
    #     """
    #     badRows = []
    #     if len(self.df.columns) > 1:
    #         for i, row in self.df.iterrows():
    #             if len(set(row)) == 1:
    #                 badRows.append(i)
    #         self.df.drop(badRows, inplace=True)
