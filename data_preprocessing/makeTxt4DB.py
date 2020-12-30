import os
import sys
import ijson
import json
import converter


def main():
    with open(os.path.join(os.path.dirname(os.path.realpath(__file__)), 'tmp', 'output.txt'), 'w', encoding='utf8') as output:
        rowSizes = []
        colSizes = []
        allColsRemoved = []

        tableCount = 0
        successes = 0
        dirStr = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'input') # Join abs. path of file with input/
    
        for subDir, _, files in os.walk(dirStr):
            for file in files:
                filename = os.fsdecode(file)
                if not (filename.endswith(".xlsx") or filename.endswith(".csv")): 
                    continue
                tableCount += 1
                if tableCount % 10 == 0:
                    sys.stderr.write('\r' + str(tableCount) + " tables analyzed")
                    sys.stderr.flush()

                table = converter.Converter(filepath=os.path.join(subDir, filename))

                # Perform column validations, row validations, Set key column
                # If failure on any one of those operations, continue to next
                rows, cols = table.getDimensions()

                colsRemoved = table.validateColumns()
                if cols - colsRemoved == 0:
                    continue

                keySet = table.setKey()
                if not keySet:
                    continue

                table.write(output)

                successes += 1
                rowSizes.append(rows)
                # allRowsRemoved.append(rowsRemoved)
                colSizes.append(cols)
                allColsRemoved.append(colsRemoved)

        if len(rowSizes) > 0:
            print("\n\nNumber of tables read: {0}".format(tableCount))
            print(
                "Number of tables successfully converted to txt: {0}".format(successes))
            print("Successful conversion rate: {0:5.3}%".format(
                successes / tableCount * 100))
            print("Average number of rows per table: {0:5.3}".format(
                avg(rowSizes)))
            print("Average number of columns per table: {0:5.3}".format(
                avg(colSizes)))
            print("Average number of columns removed per table: {0:5.3}".format(
                avg(allColsRemoved)))
        else:
            print("No tables successfully read.")

    return


def avg(l):
    """
    Calculate average of l, a list
    """
    return sum(l) / len(l) if len(l) != 0 else None


if __name__ == "__main__":
    main()
