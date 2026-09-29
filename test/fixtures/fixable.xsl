<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0">
  <xsl:template match="book">
    <xsl:if test="'true'">
      <xsl:value-of select="title"/>
    </xsl:if>
  </xsl:template>
</xsl:stylesheet>
